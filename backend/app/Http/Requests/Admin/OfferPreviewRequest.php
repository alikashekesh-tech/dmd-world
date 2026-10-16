<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Http\Requests\Concerns\NormalizesTimes;
use App\Models\Offer;
use Illuminate\Validation\Rule;

/** The offer form as it stands, for the live preview: nothing is required, nothing is saved. */
class OfferPreviewRequest extends ApiRequest
{
    use NormalizesTimes;

    protected const TIME_FIELDS = ['starts_at', 'ends_at'];

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $this->normalizeTimes();
    }

    public function rules(): array
    {
        return [
            'offer_id' => ['nullable', 'integer', 'min:1'],
            'name' => ['nullable', 'string', 'max:120'],
            'discount_type' => ['nullable', Rule::in(Offer::TYPES)],
            'discount_value' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'product_ids' => ['sometimes', 'array', 'max:5000'],
            'product_ids.*' => ['integer', 'min:1'],
            'brand_ids' => ['sometimes', 'array', 'max:500'],
            'brand_ids.*' => ['integer', 'min:1'],
            'category_ids' => ['sometimes', 'array', 'max:500'],
            'category_ids.*' => ['integer', 'min:1'],
            'entire_store' => ['sometimes', 'boolean'],
        ];
    }
}
