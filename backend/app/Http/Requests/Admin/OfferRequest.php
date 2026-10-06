<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\Offer;
use Illuminate\Validation\Rule;

/** A store-wide offer: how much off, on what, and when. */
class OfferRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'label' => ['nullable', 'string', 'max:40'],
            'discount_type' => ['required', Rule::in(Offer::TYPES)],
            'discount_value' => ['required', 'numeric', 'gt:0', 'max:100000', ...($this->input('discount_type') === 'percent' ? ['lt:100'] : [])],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', ...($this->filled('starts_at') ? ['after:starts_at'] : [])],
            'is_active' => ['sometimes', 'boolean'],
            'product_ids' => ['present', 'array', 'max:1000'],
            'product_ids.*' => ['integer', 'min:1'],
            'category_ids' => ['present', 'array', 'max:200'],
            'category_ids.*' => ['integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the offer a name.',
            'discount_value.gt' => 'The discount must be more than 0.',
            'discount_value.lt' => 'A percentage discount must be below 100%.',
            'ends_at.after' => 'The end must be after the start.',
        ];
    }
}
