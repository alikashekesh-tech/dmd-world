<?php

namespace App\Notifications;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/** Tells a buyer the store answered them. The message itself is read in the account (the email quotes the start). */
class StoreReplied extends Notification
{
    use Queueable;

    public function __construct(public Conversation $conversation, public Message $message) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $c = $this->conversation;
        $about = $c->order_id ? "your order #{$c->order?->number}" : "“{$c->subject}”";
        $link = config('dmd.frontend_url').'/account?tab=messages'.($c->order_id ? "&order={$c->order_id}" : "&conversation={$c->id}");

        return (new MailMessage)
            ->subject("DMD World replied about {$about}")
            ->greeting('Hi '.($notifiable->first_name ?? '').',')
            ->line("DMD World wrote to you about {$about}:")
            ->line(Str::limit($this->message->body, 300))
            ->action('Read and reply', $link);
    }
}
