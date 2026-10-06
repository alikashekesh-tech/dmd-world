<?php

namespace App\Http\Requests\Account;

use App\Http\Requests\ApiRequest;
use App\Support\Text;

/** A buyer's review (new or edited). Text is cleaned of invisible characters first, then measured. */
class ReviewRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $this->merge(array_filter([
            'title' => is_string($this->input('title')) ? Text::line($this->input('title'), 1000) : null,
            'body' => is_string($this->input('body')) ? Text::multiline($this->input('body'), 20000) : null,
        ], fn ($v) => $v !== null));
    }

    public function rules(): array
    {
        return [
            'product_id' => [$this->isMethod('post') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'title' => ['required', 'string', 'min:3', 'max:120'],
            'body' => ['required', 'string', 'min:10', 'max:5000'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_id.required' => 'Choose a product.',
            'rating.required' => 'Choose a rating from 1 to 5 stars.',
            'rating.between' => 'Choose a rating from 1 to 5 stars.',
            'rating.integer' => 'Choose a rating from 1 to 5 stars.',
            'title.required' => 'Give your review a short title.',
            'title.min' => 'Give your review a short title.',
            'body.required' => 'Write at least a sentence (10 characters or more).',
            'body.min' => 'Write at least a sentence (10 characters or more).',
            'body.max' => 'Keep your review under 5,000 characters.',
        ];
    }

    /** @return array{rating: int, title: string, body: string} */
    public function review(): array
    {
        return ['rating' => (int) $this->validated('rating'), 'title' => $this->validated('title'), 'body' => $this->validated('body')];
    }
}
