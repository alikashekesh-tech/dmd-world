<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\Product;
use App\Services\ProductService;
use App\Support\ProductVideo;
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
        if (is_array($this->input('variants'))) {
            $this->merge(['variants' => array_map(fn ($v) => is_array($v) && is_string($v['sku'] ?? null) ? ['sku' => trim($v['sku']) ?: null] + $v : $v, $this->input('variants'))]);
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
            // Recommended add-ons: other products, shown with this one; the buyer adds them only if they choose to.
            'addon_ids' => ['sometimes', 'array', 'max:'.Product::MAX_ADDONS],
            'addon_ids.*' => ['integer', 'distinct', Rule::exists('products', 'id')->whereNull('deleted_at'), Rule::notIn(array_filter([(int) $this->route('product')?->id]))],
            'short_description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'description' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'type' => ['sometimes', Rule::in(Product::TYPES)],
            // A variable product's price is its variants'; a simple one needs its own.
            'regular_price' => [$creating ? 'required_unless:type,variable' : 'sometimes', ...$money, 'gt:0'],
            'sale_price' => ['sometimes', 'nullable', ...$money],
            'sale_starts_at' => ['sometimes', 'nullable', 'date'],
            'sale_ends_at' => ['sometimes', 'nullable', 'date'],
            'delivery_fee' => ['sometimes', 'nullable', ...$money, 'max:1000'], // empty = the store's delivery price
            'status' => ['sometimes', Rule::in(['draft', 'published'])],
            'is_featured' => ['sometimes', 'boolean'],
            'track_stock' => ['sometimes', 'boolean'],
            'stock_quantity' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'low_stock_threshold' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000'],
            'stock_status' => ['sometimes', Rule::in(['in_stock', 'out_of_stock'])],
            'images' => ['sometimes', 'array', 'max:12'],
            'images.*.url' => ['required', 'string', 'max:2048', 'regex:#^(https?://|/storage/)#i'],
            'images.*.alt' => ['nullable', 'string', 'max:200'],
            'video_url' => ['sometimes', 'nullable', 'string', 'max:2048', function ($attribute, $value, $fail) {
                if (ProductVideo::parse($value) === null) {
                    $fail('Upload an MP4 or WebM video here, or paste a YouTube link.');
                }
            }],
            'specifications' => ['sometimes', 'array', 'max:40'],
            'specifications.*.name' => ['required', 'string', 'max:80', 'distinct:ignore_case'],
            'specifications.*.value' => ['required', 'string', 'max:500'],
            'attributes' => ['sometimes', 'nullable', 'array', 'max:'.ProductService::MAX_ATTRIBUTES],
            'attributes.*.name' => ['required', 'string', 'max:40', 'not_regex:/[<>]/'],
            'attributes.*.values' => ['required', 'array', 'min:1', 'max:'.ProductService::MAX_VALUES],
            'attributes.*.values.*' => ['required', 'string', 'max:60', 'not_regex:/[<>]/'],
            'variants' => ['sometimes', 'nullable', 'array', 'max:'.ProductService::MAX_VARIANTS],
            'variants.*.id' => ['nullable', 'integer', 'min:1'],
            'variants.*.options' => ['required', 'array', 'max:'.ProductService::MAX_ATTRIBUTES],
            'variants.*.options.*' => ['required', 'string', 'max:60'],
            'variants.*.sku' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9._\/-]+$/'],
            'variants.*.image_url' => ['nullable', 'string', 'max:2048'],
            'variants.*.regular_price' => ['required', ...$money, 'gt:0'],
            'variants.*.sale_price' => ['nullable', ...$money],
            'variants.*.track_stock' => ['sometimes', 'boolean'],
            'variants.*.stock_quantity' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
            'variants.*.stock_status' => ['sometimes', Rule::in(['in_stock', 'out_of_stock'])],
            'variants.*.is_active' => ['sometimes', 'boolean'],
            // Buy Used: a condition makes it a second-hand product sold by DMD; null makes it new again.
            'condition' => ['sometimes', 'nullable', Rule::in(array_keys(Product::CONDITIONS))],
            'condition_note' => ['sometimes', 'nullable', 'string', 'max:500', 'not_regex:/[<>]/'],
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
            'delivery_fee.decimal' => 'Use at most two decimals (cents).',
            'delivery_fee.max' => 'The delivery price can be at most $1,000.',
            'sku.regex' => 'Use letters, numbers, dots, dashes, underscores or slashes in the SKU.',
            'images.*.url.regex' => 'Images must be uploaded here or be a full https:// address.',
            'addon_ids.max' => 'Pick up to '.Product::MAX_ADDONS.' add-ons.',
            'addon_ids.*.not_in' => 'A product can’t be its own add-on.',
            'addon_ids.*.exists' => 'One of the add-ons was removed. Pick it again.',
            'specifications.*.name.distinct' => 'Each specification needs a different name.',
            'stock_quantity.min' => 'Stock can’t be negative.',
            'regular_price.required_unless' => 'Give the product a price.',
            'attributes.*.name.required' => 'Give every option a name, like Colour or Size.',
            'attributes.*.values.required' => 'Give every option at least one value.',
            'attributes.*.values.min' => 'Give every option at least one value.',
            'variants.*.regular_price.required' => 'Give every variant a price.',
            'variants.*.regular_price.gt' => 'Every variant’s price must be more than $0.',
            'variants.*.regular_price.decimal' => 'Use at most two decimals (cents).',
            'variants.*.sale_price.decimal' => 'Use at most two decimals (cents).',
            'variants.*.sku.regex' => 'Use letters, numbers, dots, dashes, underscores or slashes in a variant’s SKU.',
            'variants.*.stock_quantity.min' => 'Stock can’t be negative.',
            'condition.in' => 'Choose Like New, Excellent, Good or Fair (or New for a product that isn’t used).',
            'condition_note.max' => 'Keep the condition note under 500 characters.',
            'condition_note.not_regex' => 'Leave out < and > in the condition note.',
        ] + parent::messages();
    }
}
