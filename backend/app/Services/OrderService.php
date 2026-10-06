<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Order;
use App\Models\OrderStatusEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Status changes after an order is placed, with their stock effects: cancelling puts the items back on the shelf,
 * reopening a cancelled order takes them again (refused if they're gone). Each change locks the order row, so the
 * owner and a buyer acting at the same moment can't both win, and leaves a history line.
 */
final class OrderService
{
    public function __construct(private Inventory $inventory) {}

    public function changeStatus(Order $order, string $to, string $actor, ?Admin $admin = null, ?string $note = null, ?User $buyer = null): Order
    {
        return DB::transaction(function () use ($order, $to, $actor, $admin, $note, $buyer) {
            /** @var Order $locked */
            $locked = Order::lockForUpdate()->with('items.product')->findOrFail($order->id);
            $from = $locked->status;
            if ($from === $to) {
                return $locked;
            }
            if (! in_array($to, Order::TRANSITIONS[$from] ?? [], true)) {
                throw new ApiException(409, 'STATUS_NOT_ALLOWED', "An order that is {$this->label($from)} can’t be marked {$this->label($to)}.");
            }

            $changes = ['status' => $to];
            if ($to === 'cancelled') {
                $this->restock($locked);
                $changes += ['cancelled_at' => now(), 'cancel_reason' => $note ? mb_substr($note, 0, 300) : null];
            }
            if ($from === 'cancelled') {
                $this->reserveAgain($locked);
                $changes += ['cancelled_at' => null, 'cancel_reason' => null];
            }
            if ($to === 'completed') {
                $changes['completed_at'] = now();
                if ($locked->payment_status === 'unpaid' && $locked->payment_method === 'cod') {
                    $changes['payment_status'] = 'paid'; // cash collected on delivery
                }
            }
            if ($to === 'refunded') {
                $changes['payment_status'] = 'refunded';
            }
            $locked->forceFill($changes)->save();

            (new OrderStatusEvent)->forceFill(['order_id' => $locked->id, 'from_status' => $from, 'to_status' => $to, 'actor' => $actor, 'admin_id' => $admin?->id, 'note' => $note])->save();
            Activity::record('order.status', ($actor === 'buyer' ? "{$locked->first_name} cancelled" : 'Marked')." order #{$locked->number}".($actor === 'buyer' ? '' : " {$this->label($to)}"), $locked, $admin, $buyer);

            $order->setRawAttributes($locked->getAttributes(), true);
            Catalog::bust(); // best-seller counts follow paid and cancelled orders

            return $locked;
        });
    }

    public function addNote(Order $order, string $note, Admin $admin): void
    {
        (new OrderStatusEvent)->forceFill(['order_id' => $order->id, 'actor' => 'admin', 'admin_id' => $admin->id, 'note' => mb_substr($note, 0, 500)])->save();
        Activity::record('order.note', "Added a private note to order #{$order->number}", $order, $admin);
    }

    public function setPayment(Order $order, string $status, Admin $admin): Order
    {
        $order->forceFill(['payment_status' => $status])->save();
        (new OrderStatusEvent)->forceFill(['order_id' => $order->id, 'actor' => 'admin', 'admin_id' => $admin->id, 'note' => "Payment marked {$status}"])->save();
        Activity::record('order.payment', "Marked order #{$order->number} as {$status}", $order, $admin);

        return $order;
    }

    public function label(string $status): string
    {
        return str_replace('_', ' ', $status);
    }

    private function restock(Order $order): void
    {
        foreach ($order->items as $item) {
            if ($item->product && $item->product->track_stock) {
                $this->inventory->adjust($item->product, $item->quantity, 'cancellation', null, "Order #{$order->number} cancelled", $order->id);
            }
        }
    }

    private function reserveAgain(Order $order): void
    {
        foreach ($order->items as $item) {
            if ($item->product && $item->product->track_stock) {
                $this->inventory->adjust($item->product, -$item->quantity, 'order', null, "Order #{$order->number} reopened", $order->id);
            }
        }
    }
}
