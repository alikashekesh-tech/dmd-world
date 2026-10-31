<?php

namespace App\Notifications;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A sold-out product (or the variant of it) the buyer asked about is available again. */
class BackInStock extends Notification
{
    use Queueable;

    public function __construct(public Product $product, public ?ProductVariant $variant = null, public ?string $token = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $name = $this->variant ? "{$this->product->name} ({$this->variant->label($this->product->variation_attributes)})" : $this->product->name;
        $first = $notifiable->first_name ?? null;
        $url = config('dmd.frontend_url')."/product/{$this->product->id}".($this->variant ? "?variant={$this->variant->id}" : '');

        return (new MailMessage)
            ->subject("{$name} is back in stock")
            ->greeting('Good news'.($first ? ", {$first}" : '').'!')
            ->line("{$name} is available again at DMD World. Stock can go quickly.")
            ->action('See it now', $url)
            ->line('You asked us to tell you once. We won’t email you about it again unless you ask.');
    }
}
