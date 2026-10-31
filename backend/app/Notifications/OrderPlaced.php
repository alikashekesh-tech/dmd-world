<?php

namespace App\Notifications;

use App\Models\Order;
use App\Services\StoreSettings;
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
            ->line("We’ve received your order #{$o->number} and it will be processed shortly. DMD will call or message you to confirm it.");
        foreach ($o->items as $item) {
            $mail->line("{$item->quantity} × {$item->displayName()}: $".Money::decimal(Money::cents($item->line_total)));
        }

        if (Money::cents($o->shipping_total) > 0) {
            $mail->line('Delivery: $'.Money::decimal(Money::cents($o->shipping_total)));
        }

        $mail->line('Total: $'.Money::decimal(Money::cents($o->total)).' ('.(Order::PAYMENT_METHODS[$o->payment_method] ?? $o->payment_method).')');
        // Paid outside the site: the buyer waits for DMD's details, and the order is processed once the payment arrives.
        if (in_array($o->payment_method, ['whish', 'bank_transfer'], true) && $o->payment_status === 'unpaid') {
            $mail->line('Payment: '.(StoreSettings::get($o->payment_method.'_note') ?: StoreSettings::DEFAULTS[$o->payment_method.'_note']));
        }

        return $mail->action('View your order', config('dmd.frontend_url')."/order/{$o->id}");
    }
}
