<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\Banner;
use Illuminate\Validation\Rule;

/**
 * A banner. Links are a storefront path ("/shop?q=…", never "//…") or an https:// address; images are uploads
 * (/storage/…) or https:// addresses. Nothing else (no javascript:, data: or http:) can reach the storefront.
 */
class BannerRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'placement' => ['required', Rule::in(Banner::PLACEMENTS)],
            'title' => ['required', 'string', 'min:2', 'max:120'],
            'text' => ['nullable', 'string', 'max:300'],
            'link_url' => ['nullable', 'string', 'max:500', 'regex:#^(/(?!/)[^\s]*|https://[^\s]+)$#'],
            'link_label' => ['nullable', 'string', 'max:40', 'required_with:link_url'],
            'image_url' => ['nullable', 'string', 'max:2048', 'regex:#^(/storage/[A-Za-z0-9/_.\-]+|https://[^\s]+)$#'],
            'is_active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', ...($this->filled('starts_at') ? ['after:starts_at'] : [])],
        ];
    }

    public function messages(): array
    {
        return [
            'link_url.regex' => 'Link to a page of the store (starting with /) or a secure https:// address.',
            'image_url.regex' => 'Upload the image, or use a secure https:// address.',
            'link_label.required_with' => 'Say what the link does (for example “Shop the sale”).',
            'ends_at.after' => 'The end must be after the start.',
        ];
    }
}
