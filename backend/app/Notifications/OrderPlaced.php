<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** The buyer's order confirmation (sent to the order's email; with MAIL_MAILER=log it's written to the log). */
class OrderPlaced extends Notification
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
        $mail = (new MailMessage)
            ->subject("DMD World order #{$o->number} received")
            ->greeting("Thanks, {$o->first_name}!")
            ->line("We’ve received your order #{$o->number}. DMD will call or message you to confirm it.");
        foreach ($o->items as $item) {
            $mail->line("{$item->quantity} × {$item->product_name}: $".Money::decimal(Money::cents($item->line_total)));
        }

        return $mail->line('Total: $'.Money::decimal(Money::cents($o->total)).' ('.(Order::PAYMENT_METHODS[$o->payment_method] ?? $o->payment_method).')')
            ->action('View your order', config('dmd.frontend_url')."/order/{$o->id}");
    }
}
