<?php

namespace App\Http\Requests\Checkout;

use App\Http\Requests\ApiRequest;
use App\Services\Checkout;

/** A cart to price: product ids and quantities only. Prices sent by the browser are ignored. */
class QuoteRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:'.Checkout::MAX_LINES],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:'.Checkout::MAX_LINE_QTY],
            'coupon' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'string', 'max:254'], // only used for "once per customer" codes
        ];
    }

    public function messages(): array
    {
        return [
            'items.required' => 'Your cart is empty.',
            'items.min' => 'Your cart is empty.',
            'items.*.quantity.max' => 'That quantity is more than the store can ever hold.',
        ] + parent::messages();
    }
}
