<?php

namespace App\Http\Requests;

use App\Support\Text;

/** A message to (or from) the store. Optional `order_id` / `subject` when it starts a conversation. */
class MessageRequest extends ApiRequest
{
    public const MAX = 2000;

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('body'))) {
            $this->merge(['body' => Text::multiline($this->input('body'), 20000)]);
        }
        if (is_string($this->input('subject'))) {
            $this->merge(['subject' => Text::line($this->input('subject'), 1000)]);
        }
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:2', 'max:'.self::MAX],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'subject' => ['nullable', 'string', 'min:3', 'max:150'],
            'user_id' => ['nullable', 'integer', 'min:1'], // only read by the owner's "new conversation"
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Write a message first.',
            'body.min' => 'Write a message first.',
            'body.max' => 'Keep your message under 2,000 characters.',
            'subject.min' => 'Give the conversation a short subject.',
        ];
    }
}
