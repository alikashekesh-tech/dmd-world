<?php

namespace App\Notifications;

use App\Models\Product;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A sold-out product the buyer asked about is available again. */
class BackInStock extends Notification
{
    use Queueable;

    public function __construct(public Product $product) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->product->name} is back in stock")
            ->greeting('Good news'.($notifiable->first_name ? ", {$notifiable->first_name}" : '').'!')
            ->line("{$this->product->name} is available again at DMD World. Stock can go quickly.")
            ->action('See it now', config('dmd.frontend_url')."/product/{$this->product->id}")
            ->line('You asked us to tell you once. We won’t email you about it again unless you ask.');
    }
}
