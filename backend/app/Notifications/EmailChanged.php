<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the OLD address when a buyer's sign-in email changes, so a hijacked account doesn't go unnoticed. */
class EmailChanged extends Notification
{
    use Queueable;

    public function __construct(public string $newEmail) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        // Only part of the new address is shown, in case this email is read by someone else.
        $masked = preg_replace('/(?<=.).(?=[^@]*@)/u', '•', $this->newEmail);

        return (new MailMessage)
            ->subject('Your DMD World sign-in email was changed')
            ->line("The email you use to sign in to DMD World was changed to {$masked}.")
            ->line('If you made this change, there is nothing else to do.')
            ->line('If you didn’t, reply to this email or call DMD World right away so we can secure your account.');
    }
}
