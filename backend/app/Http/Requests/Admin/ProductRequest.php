<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

/** Adding (POST) or editing (PUT: send only what changes) a product. Cross-field rules live in ProductService. */
class ProductRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('slug'))) {
            $this->merge(['slug' => strtolower($this->input('slug')) ?: null]);
        }
        if (is_string($this->input('sku'))) {
            $this->merge(['sku' => trim($this->input('sku')) ?: null]);
        }
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $money = ['numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'];
        $size = ['nullable', 'numeric', 'min:0', 'max:99999'];

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:200', 'not_regex:/[<>]/'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:200', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'sku' => ['sometimes', 'nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9._\/-]+$/'],
            'brand_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brands', 'id')->whereNull('deleted_at')],
            'category_ids' => ['sometimes', 'array', 'max:20'],
            'category_ids.*' => ['integer', 'distinct', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'primary_category_id' => ['sometimes', 'nullable', 'integer'],
            'short_description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'description' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'regular_price' => [$creating ? 'required' : 'sometimes', ...$money, 'gt:0'],
            'sale_price' => ['sometimes', 'nullable', ...$money],
            'sale_starts_at' => ['sometimes', 'nullable', 'date'],
            'sale_ends_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(['draft', 'published'])],
            'is_featured' => ['sometimes', 'boolean'],
            'track_stock' => ['sometimes', 'boolean'],
            'stock_quantity' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'low_stock_threshold' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000'],
            'stock_status' => ['sometimes', Rule::in(['in_stock', 'out_of_stock'])],
            'images' => ['sometimes', 'array', 'max:12'],
            'images.*.url' => ['required', 'string', 'max:2048', 'regex:#^(https?://|/storage/)#i'],
            'images.*.alt' => ['nullable', 'string', 'max:200'],
            'specifications' => ['sometimes', 'array', 'max:40'],
            'specifications.*.name' => ['required', 'string', 'max:80', 'distinct:ignore_case'],
            'specifications.*.value' => ['required', 'string', 'max:500'],
            'weight_kg' => $size,
            'length_cm' => $size,
            'width_cm' => $size,
            'height_cm' => $size,
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the product a name.',
            'name.not_regex' => 'Leave out < and > in the name.',
            'regular_price.required' => 'Give the product a price.',
            'regular_price.gt' => 'The price must be more than $0.',
            'regular_price.decimal' => 'Use at most two decimals (cents).',
            'sale_price.decimal' => 'Use at most two decimals (cents).',
            'sku.regex' => 'Use letters, numbers, dots, dashes, underscores or slashes in the SKU.',
            'images.*.url.regex' => 'Images must be uploaded here or be a full https:// address.',
            'specifications.*.name.distinct' => 'Each specification needs a different name.',
            'stock_quantity.min' => 'Stock can’t be negative.',
        ] + parent::messages();
    }
}
