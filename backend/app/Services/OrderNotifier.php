<?php

namespace App\Services;

use App\Models\Order;
use App\Notifications\OrderUpdate;
use App\Services\Messaging\Outbox;
use App\Support\Money;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * What the buyer and the owner hear about an order, after the change is saved. The buyer's updates go to the order's
 * email (when the owner keeps "email customers about their order" on) and, if they asked for it and a provider is set
 * up, by WhatsApp. The owner's private number (Settings) hears about new orders the same way. A failed message is
 * logged and recorded, never turned into a failed order change. Public contact details are never used as recipients.
 */
class OrderNotifier
{
    public function __construct(private Outbox $outbox) {}

    /** A new order: the owner's private number, and the buyer's phone if they asked for updates there. */
    public function placed(Order $order): void
    {
        $owner = StoreSettings::get('order_notification_phone');
        if ($owner && $this->outbox->available('whatsapp')) {
            $text = "New DMD World order #{$order->number}: {$order->customerName()}, $".Money::decimal(Money::cents($order->total))
                .' ('.(Order::PAYMENT_METHODS[$order->payment_method] ?? $order->payment_method).'). '.config('dmd.admin_url')."/#/orders/{$order->id}";
            $this->text('whatsapp', $owner, $text, 'new_order', $order);
        }
        if ($order->updates_by_phone && $order->phone && $this->outbox->available('whatsapp')) {
            $this->text('whatsapp', $order->phone, "DMD World: we received your order #{$order->number}. We’ll be in touch to confirm it.", 'order_update', $order);
        }
    }

    /** An admin status change the buyer should hear about. */
    public function statusChanged(Order $order, string $from, string $to): void
    {
        $event = match (true) {
            $to === 'processing' && in_array($from, ['pending', 'on_hold', 'failed'], true) => 'confirmed',
            $to === 'completed' => 'completed',
            $to === 'cancelled' => 'cancelled',
            $to === 'refunded' => 'refunded',
            default => null,
        };
        if ($event) {
            $this->tell($order, $event);
        }
    }

    public function dispatched(Order $order): void
    {
        $this->tell($order, 'dispatched');
    }

    public function paymentReceived(Order $order): void
    {
        $this->tell($order, 'payment_received');
    }

    private function tell(Order $order, string $event): void
    {
        if (StoreSettings::get('notify_customers_status') && $order->email) {
            rescue(fn () => Notification::route('mail', $order->email)->notify(new OrderUpdate($order, $event)));
        }
        if ($order->updates_by_phone && $order->phone && $this->outbox->available('whatsapp')) {
            $this->text('whatsapp', $order->phone, 'DMD World: '.OrderUpdate::sentence($order, $event), 'order_update', $order);
        }
    }

    private function text(string $channel, string $to, string $text, string $purpose, Order $order): void
    {
        try {
            $this->outbox->send($channel, $to, $text, $purpose, $order);
        } catch (Throwable $e) {
            Log::warning("Order #{$order->number} {$purpose} message failed: {$e->getMessage()}");
        }
    }
}
