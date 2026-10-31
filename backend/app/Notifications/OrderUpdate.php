<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the buyer what happened to their order: confirmed, on its way (or ready to collect), completed, cancelled, refunded or paid. */
class OrderUpdate extends Notification
{
    use Queueable;

    public const EVENTS = ['confirmed', 'dispatched', 'completed', 'cancelled', 'refunded', 'payment_received'];

    public function __construct(public Order $order, public string $event) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /** One short sentence, for the email and for a WhatsApp/SMS text. */
    public static function sentence(Order $o, string $event): string
    {
        $pickup = $o->delivery_method === 'pickup';

        return match ($event) {
            'confirmed' => "Your order #{$o->number} is confirmed and being prepared.",
            'dispatched' => $pickup ? "Your order #{$o->number} is ready to collect from the store." : "Your order #{$o->number} is on its way to you.",
            'completed' => $pickup ? "Your order #{$o->number} was collected. Thank you for shopping with DMD World!" : "Your order #{$o->number} was delivered. Thank you for shopping with DMD World!",
            'cancelled' => "Your order #{$o->number} was cancelled.".($o->cancel_reason ? " Reason: {$o->cancel_reason}" : ''),
            'refunded' => "Your order #{$o->number} was refunded: $".Money::decimal(Money::cents($o->total)).'.',
            'payment_received' => "We received your payment for order #{$o->number}. Thank you!",
        };
    }

    public function toMail(object $notifiable): MailMessage
    {
        $o = $this->order;
        $subject = match ($this->event) {
            'confirmed' => "Order #{$o->number} confirmed",
            'dispatched' => $o->delivery_method === 'pickup' ? "Order #{$o->number} is ready to collect" : "Order #{$o->number} is on its way",
            'completed' => $o->delivery_method === 'pickup' ? "Order #{$o->number} collected" : "Order #{$o->number} delivered",
            'cancelled' => "Order #{$o->number} cancelled",
            'refunded' => "Order #{$o->number} refunded",
            'payment_received' => "Payment received for order #{$o->number}",
        };

        return (new MailMessage)
            ->subject("DMD World: {$subject}")
            ->greeting("Hello {$o->first_name},")
            ->line(self::sentence($o, $this->event))
            ->action('View your order', config('dmd.frontend_url')."/order/{$o->id}")
            ->line('Questions? Reply through your order page or contact DMD World.');
    }
}
