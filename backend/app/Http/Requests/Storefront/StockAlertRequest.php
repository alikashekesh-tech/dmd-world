<?php

namespace App\Http\Requests\Storefront;

use App\Http\Requests\ApiRequest;
use App\Services\StockAlerts;
use App\Support\Phone;
use Illuminate\Validation\Rule;

/** "Notify me when it's available": the product (and variant), how to reach the buyer, and their consent. */
class StockAlertRequest extends ApiRequest
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
        $signedIn = $this->user() !== null;

        return [
            'product_id' => ['required', 'integer', 'min:1'],
            'variant_id' => ['nullable', 'integer', 'min:1'],
            'channel' => ['required', Rule::in(StockAlerts::CHANNELS)],
            'email' => [Rule::requiredIf(fn () => $this->input('channel') === 'email' && ! $signedIn), 'nullable', 'string', 'email', 'max:254'],
            'phone' => [Rule::requiredIf(fn () => $this->input('channel') !== 'email'), ...self::phoneRules()],
            'consent' => ['accepted'],
        ];
    }

    public function messages(): array
    {
        return parent::messages() + [
            'phone.required' => 'Enter your phone number.',
            'consent.accepted' => 'Tick the box so we may contact you about this product.',
        ];
    }
}
