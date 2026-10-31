<?php

namespace App\Services\Messaging;

use App\Models\OutboundMessage;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * Every WhatsApp/SMS text goes through here: sent only when a provider is configured for the channel, and every
 * attempt is recorded with its real outcome (sent, failed, not_configured). Never reports a text as sent that wasn't.
 */
final class Outbox
{
    public const CHANNELS = ['whatsapp', 'sms'];

    public function __construct(private Messenger $messenger) {}

    public function available(string $channel): bool
    {
        return in_array($channel, self::CHANNELS, true) && $this->messenger->available($channel);
    }

    /** @return string sent | failed | not_configured */
    public function send(string $channel, string $to, string $text, string $purpose, ?Model $about = null): string
    {
        $status = 'not_configured';
        $error = null;
        if ($this->available($channel)) {
            try {
                $this->messenger->send($channel, $to, $text);
                $status = 'sent';
            } catch (Throwable $e) {
                $status = 'failed';
                $error = mb_substr($e->getMessage(), 0, 300);
            }
        }
        (new OutboundMessage)->forceFill([
            'channel' => $channel, 'to' => mb_substr($to, 0, 30), 'purpose' => $purpose, 'status' => $status, 'error' => $error,
            'about_type' => $about ? $about->getMorphClass() : null, 'about_id' => $about?->getKey(),
        ])->save();

        return $status;
    }
}
