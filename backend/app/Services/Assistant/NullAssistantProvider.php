<?php

namespace App\Services\Assistant;

use RuntimeException;

/** No AI provider: nothing is called and nothing is billed. */
final class NullAssistantProvider implements AssistantProvider
{
    public function available(): bool
    {
        return false;
    }

    public function reply(string $question, string $locale, array $facts): array
    {
        throw new RuntimeException('No AI provider is configured for the shopping assistant.');
    }
}
