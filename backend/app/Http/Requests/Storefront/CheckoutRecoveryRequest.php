<?php

namespace App\Http\Requests\Storefront;

use App\Http\Requests\ApiRequest;
use App\Services\Checkout;
use App\Services\CheckoutRecoveries;
use App\Support\Phone;
use Illuminate\Validation\Rule;

/** "Remind me if I don't finish": the checkout's items and how to reach the customer, saved only with their consent. */
class CheckoutRecoveryRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('phone')) && $this->input('phone') !== '') {
            $this->merge(['phone' => Phone::normalize($this->input('phone')) ?? $this->input('phone')]);
        }
    }

    public function rules(): array
    {
        return [
            'token' => ['nullable', 'string', 'regex:/^[A-Za-z0-9]{40}$/'],
            'items' => ['required', 'array', 'min:1', 'max:'.Checkout::MAX_LINES],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:'.Checkout::MAX_LINE_QTY],
            'first_name' => ['nullable', 'string', 'max:60', 'not_regex:/[<>]/'],
            'channel' => ['required', Rule::in(CheckoutRecoveries::CHANNELS)],
            'email' => [Rule::requiredIf(fn () => $this->input('channel') === 'email'), 'nullable', 'string', 'email:rfc', 'max:254'],
            'phone' => [Rule::requiredIf(fn () => $this->input('channel') !== 'email'), ...self::phoneRules()],
            'consent' => ['accepted'],
        ];
    }
}
