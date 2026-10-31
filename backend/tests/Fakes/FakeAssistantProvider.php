<?php

namespace Tests\Fakes;

use App\Services\Assistant\AssistantProvider;
use RuntimeException;

/** An AI provider for tests: records what it was given and answers with a fixed text, or fails. Nothing is called. */
class FakeAssistantProvider implements AssistantProvider
{
    /** @var list<array{question: string, locale: string, facts: array}> */
    public array $calls = [];

    public function __construct(private bool $failing = false) {}

    public function available(): bool
    {
        return true;
    }

    public function reply(string $question, string $locale, array $facts): array
    {
        $this->calls[] = compact('question', 'locale', 'facts');
        if ($this->failing) {
            throw new RuntimeException('provider down');
        }

        return ['text' => 'Worded by the AI from '.count($facts['products']).' products.', 'input_tokens' => 1200, 'output_tokens' => 150, 'cost_usd' => 0.25];
    }

    public static function install(bool $failing = false): self
    {
        $fake = new self($failing);
        app()->instance(AssistantProvider::class, $fake);

        return $fake;
    }
}
