<?php

namespace App\Notifications;

use App\Models\CheckoutRecovery;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** The one reminder about a checkout the customer didn't finish (they ticked "remind me"). Prices aren't promised: they're worked out again. */
class CheckoutReminder extends Notification
{
    use Queueable;

    /** @param  list<string>  $names  what was in the checkout */
    public function __construct(public CheckoutRecovery $recovery, public array $names, public string $url) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('You left something at DMD World')
            ->greeting('Hello'.($this->recovery->first_name ? " {$this->recovery->first_name}" : '').',')
            ->line('You started an order at DMD World and asked us to remind you if you didn’t finish it. Your items:');
        foreach (array_slice($this->names, 0, 6) as $name) {
            $mail->line("• {$name}");
        }
        if (count($this->names) > 6) {
            $mail->line('• and '.(count($this->names) - 6).' more');
        }

        return $mail->action('Finish your order', $this->url)
            ->line('Prices and stock are checked again when you open it. This is the only reminder we’ll send about this checkout.');
    }
}
