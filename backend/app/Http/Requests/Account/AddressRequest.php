<?php

namespace App\Http\Requests\Account;

use App\Http\Requests\ApiRequest;

/** Adding (POST: all required fields) or editing (PATCH: only what changes) a saved address. */
class AddressRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('country'))) {
            $this->merge(['country' => strtoupper($this->input('country'))]);
        }
    }

    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';
        $text = fn (int $max) => ['nullable', 'string', 'max:'.$max, 'not_regex:/[<>]/'];

        return [
            'label' => $text(40),
            'first_name' => [$required, ...array_slice(self::nameRules(), 1)],
            'last_name' => [$required, ...array_slice(self::nameRules(), 1)],
            'phone' => [$required, ...array_slice(self::phoneRules(true), 1)],
            'country' => ['sometimes', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'city' => [$required, 'string', 'max:80', 'not_regex:/[<>]/'],
            'area' => $text(80),
            'street' => [$required, 'string', 'max:160', 'not_regex:/[<>]/'],
            'building' => $text(80),
            'floor' => $text(20),
            'notes' => $text(300),
            'is_default' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.required' => 'Enter a phone number DMD can call about the delivery.',
            'city.required' => 'Enter the city.',
            'street.required' => 'Enter the street.',
            'country.regex' => 'Use a two-letter country code, like LB.',
            '*.not_regex' => 'Leave out < and >.',
        ] + parent::messages();
    }
}
