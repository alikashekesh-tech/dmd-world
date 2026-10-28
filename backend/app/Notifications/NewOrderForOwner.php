<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the store a new order came in (sent to the order_notification_email setting), with what's needed to act on it. */
class NewOrderForOwner extends Notification
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $o = $this->order->loadMissing('items');
        $total = '$'.Money::decimal(Money::cents($o->total));
        $mail = (new MailMessage)
            ->subject("New order #{$o->number} · {$total} · {$o->customerName()}")
            ->greeting("New order #{$o->number}")
            ->line("Customer: {$o->customerName()}")
            ->line("Phone: {$o->phone}")
            ->line("Email: {$o->email}")
            ->line('Delivery: '.(Order::DELIVERY_METHODS[$o->delivery_method] ?? $o->delivery_method).($o->delivery_method === 'delivery' ? " to {$o->addressLine()}" : ''));
        if ($o->ship_notes) {
            $mail->line("Notes: {$o->ship_notes}");
        }
        foreach ($o->items as $item) {
            $mail->line("{$item->quantity} × {$item->displayName()}: $".Money::decimal(Money::cents($item->line_total)));
        }
        if ($o->coupon_code) {
            $mail->line("Coupon: {$o->coupon_code}");
        }
        if (Money::cents($o->shipping_total) > 0) {
            $mail->line('Delivery fee: $'.Money::decimal(Money::cents($o->shipping_total)));
        }

        return $mail->line("Total: {$total} (".(Order::PAYMENT_METHODS[$o->payment_method] ?? $o->payment_method).')')
            ->action('Open the order', config('dmd.frontend_url')."/admin/orders/{$o->id}");
    }
}
