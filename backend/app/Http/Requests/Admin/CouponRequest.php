<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\Coupon;
use Illuminate\Validation\Rule;

/** A discount code and its rules. */
class CouponRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('code'))) {
            $this->merge(['code' => Coupon::normalize($this->input('code'))]);
        }
    }

    public function rules(): array
    {
        $id = $this->route('coupon')?->id;

        return [
            'code' => ['required', 'string', 'min:3', 'max:60', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('coupons', 'code')->ignore($id)],
            'description' => ['nullable', 'string', 'max:255'],
            'discount_type' => ['required', Rule::in(Coupon::TYPES)],
            'amount' => ['required', 'numeric', 'gt:0', 'max:100000', ...($this->input('discount_type') === 'percent' ? ['max:100'] : [])],
            'minimum_spend' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'maximum_spend' => ['nullable', 'numeric', 'min:0', 'max:1000000', ...($this->filled('minimum_spend') ? ['gte:minimum_spend'] : [])],
            'usage_limit' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'usage_limit_per_customer' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'exclude_sale_items' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', ...($this->filled('starts_at') ? ['after:starts_at'] : [])],
            'is_active' => ['sometimes', 'boolean'],
            'product_ids' => ['sometimes', 'array', 'max:1000'], 'product_ids.*' => ['integer', 'min:1'],
            'category_ids' => ['sometimes', 'array', 'max:200'], 'category_ids.*' => ['integer', 'min:1'],
            'excluded_product_ids' => ['sometimes', 'array', 'max:1000'], 'excluded_product_ids.*' => ['integer', 'min:1'],
            'excluded_category_ids' => ['sometimes', 'array', 'max:200'], 'excluded_category_ids.*' => ['integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'Use letters, numbers, dashes and underscores only (no spaces).',
            'code.unique' => 'Another coupon already uses this code.',
            'code.min' => 'Codes need at least 3 characters.',
            'amount.gt' => 'The discount must be more than 0.',
            'amount.max' => 'A percentage can’t be more than 100%.',
            'maximum_spend.gte' => 'The maximum spend must be at least the minimum.',
            'expires_at.after' => 'The expiry must be after the start.',
        ];
    }
}
