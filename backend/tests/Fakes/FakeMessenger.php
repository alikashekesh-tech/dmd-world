<?php

namespace Tests\Fakes;

use App\Services\Messaging\Messenger;
use RuntimeException;

/** A WhatsApp/SMS provider for tests: keeps every text instead of sending it, or refuses them all. */
class FakeMessenger implements Messenger
{
    /** @var list<array{channel: string, to: string, text: string}> */
    public array $sent = [];

    public function __construct(private array $channels = ['whatsapp', 'sms'], private bool $failing = false) {}

    public function available(string $channel): bool
    {
        return in_array($channel, $this->channels, true);
    }

    public function send(string $channel, string $to, string $text): void
    {
        if ($this->failing) {
            throw new RuntimeException('The provider refused the message.');
        }
        $this->sent[] = compact('channel', 'to', 'text');
    }

    /** Binds a fake in place of the store's messenger and returns it. */
    public static function install(array $channels = ['whatsapp', 'sms'], bool $failing = false): self
    {
        $fake = new self($channels, $failing);
        app()->instance(Messenger::class, $fake);

        return $fake;
    }
}
