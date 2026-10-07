<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Order;
use App\Models\OrderStatusEvent;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Status changes after an order is placed, with their stock effects: cancelling puts the items back on the shelf,
 * refunding does too unless the owner says the goods aren't coming back, and reopening a cancelled order takes them
 * again (refused if they're gone). What goes back is exactly what each line still holds (order_items.stock_held), so
 * stock is never returned twice or for units that were never taken. Each change locks the order row, so the owner and
 * a buyer acting at the same moment can't both win, and leaves a history line.
 */
final class OrderService
{
    public function __construct(private Inventory $inventory) {}

    /** $restock: for a refund, whether the goods came back and can be sold again (cancelling always returns stock). */
    public function changeStatus(Order $order, string $to, string $actor, ?Admin $admin = null, ?string $note = null, ?User $buyer = null, bool $restock = true): Order
    {
        return DB::transaction(function () use ($order, $to, $actor, $admin, $note, $buyer, $restock) {
            /** @var Order $locked */
            $locked = Order::lockForUpdate()->with('items.product')->findOrFail($order->id);
            $from = $locked->status;
            if ($from === $to) {
                return $locked;
            }
            if (! in_array($to, Order::TRANSITIONS[$from] ?? [], true)) {
                throw new ApiException(409, 'STATUS_NOT_ALLOWED', "An order that is {$this->label($from)} can’t be marked {$this->label($to)}.");
            }
            // A buyer may only cancel an order DMD hasn't confirmed. Checked again here, under the lock: the owner may have
            // confirmed it between the buyer's page loading and this request.
            if ($actor === 'buyer' && ! $locked->cancellableByBuyer()) {
                throw new ApiException(409, 'NOT_CANCELLABLE', 'DMD has already confirmed this order. Message or call DMD to change it.');
            }

            $changes = ['status' => $to];
            if ($to === 'cancelled') {
                $this->returnStock($locked, 'cancellation', "Order #{$locked->number} cancelled");
                $changes += ['cancelled_at' => now(), 'cancel_reason' => $note ? mb_substr($note, 0, 300) : null];
            }
            if ($from === 'cancelled') {
                $this->takeStock($locked);
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
                // Goods back on the shelf, or (not returned) the order simply stops holding them: either way only once.
                $this->returnStock($locked, 'refund', "Order #{$locked->number} refunded", toShelf: $restock);
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

    /**
     * Returns what each line still holds to stock (or, $toShelf false, lets it go), then the line holds nothing: a second
     * call, or a line whose units were never taken, changes nothing.
     */
    private function returnStock(Order $order, string $reason, string $note, bool $toShelf = true): void
    {
        foreach ($order->items->sortBy('product_id') as $item) { // product rows locked in one order: no deadlock
            if ($item->stock_held < 1) {
                continue;
            }
            $product = $toShelf && $item->product_id ? Product::withTrashed()->find($item->product_id) : null; // archived too
            if ($product) {
                $this->inventory->adjust($product, $item->stock_held, $reason, null, $note, $order->id);
            }
            $item->forceFill(['stock_held' => 0])->save();
        }
    }

    /**
     * Takes the stock a reopened order needs: only what each line doesn't already hold, so it is never taken twice
     * (refused, with nothing changed, if it's no longer there).
     */
    private function takeStock(Order $order): void
    {
        foreach ($order->items->sortBy('product_id') as $item) {
            $missing = $item->quantity - $item->stock_held;
            if ($missing < 1 || ! $item->product || ! $item->product->track_stock) {
                continue;
            }
            $this->inventory->adjust($item->product, -$missing, 'order', null, "Order #{$order->number} reopened", $order->id);
            $item->forceFill(['stock_held' => $item->quantity])->save();
        }
    }
}
