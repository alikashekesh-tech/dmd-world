<?php

namespace App\Services\Assistant;

/**
 * An AI model that words the shopping assistant's answer. It only ever sees facts the store gives it (products found
 * in MySQL, the store's own settings) and is told to use nothing else. None is connected: the store hasn't approved
 * a provider or a budget, so NullAssistantProvider is bound and the assistant answers from the catalog directly.
 * A provider is added as another implementation, configured on the server (ASSISTANT_DRIVER and its key in .env).
 */
interface AssistantProvider
{
    public function available(): bool;

    /**
     * @param  array{products: list<array>, store: array}  $facts
     * @return array{text: string, input_tokens: int, output_tokens: int, cost_usd: float}
     */
    public function reply(string $question, string $locale, array $facts): array;
}
