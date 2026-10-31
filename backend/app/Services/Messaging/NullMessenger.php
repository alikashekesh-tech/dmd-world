<?php

namespace App\Services\Messaging;

use RuntimeException;

/** No WhatsApp/SMS provider configured: no channel is available and nothing is ever sent. */
final class NullMessenger implements Messenger
{
    public function available(string $channel): bool
    {
        return false;
    }

    public function send(string $channel, string $to, string $text): void
    {
        throw new RuntimeException('No WhatsApp/SMS provider is configured.');
    }
}
