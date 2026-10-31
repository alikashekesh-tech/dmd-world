<?php

namespace App\Services\Messaging;

/**
 * Sends a WhatsApp or SMS text through an approved provider. The store has none configured (MESSAGING_DRIVER=none),
 * so the bound messenger is NullMessenger: nothing is sent, and nothing pretends to have been. A provider (WhatsApp
 * Business Platform, an SMS gateway) is added as another implementation once DMD has an account and credentials.
 */
interface Messenger
{
    /** Whether texts can go out at all on this channel (whatsapp | sms). */
    public function available(string $channel): bool;

    /** Sends one text; throws when the provider refuses it. */
    public function send(string $channel, string $to, string $text): void;
}
