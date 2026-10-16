<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\Banner;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * A banner. Links are a storefront path ("/shop?q=…", never "//…") or an https:// address; images are uploads
 * (/storage/…) or https:// addresses. Nothing else (no javascript:, data: or http:) can reach the storefront.
 */
class BannerRequest extends ApiRequest
{
    private const IMAGE = '#^(/storage/[A-Za-z0-9/_.\-]+|https://[^\s]+)$#';

    public function rules(): array
    {
        return [
            'placement' => ['required', Rule::in(Banner::PLACEMENTS)],
            'title' => ['required', 'string', 'min:2', 'max:120'],
            'text' => ['nullable', 'string', 'max:300'],
            'link_url' => ['nullable', 'string', 'max:500', 'regex:#^(/(?!/)[^\s]*|https://[^\s]+)$#'],
            'link_label' => ['nullable', 'string', 'max:40', 'required_with:link_url'],
            'image_url' => ['nullable', 'string', 'max:2048', 'regex:'.self::IMAGE],
            'image_mobile_url' => ['nullable', 'string', 'max:2048', 'regex:'.self::IMAGE],
            'focal_point' => ['nullable', 'string', 'regex:#^(100|[1-9]?[0-9])% (100|[1-9]?[0-9])%$#'],
            'overlay' => ['nullable', Rule::in(Banner::OVERLAYS)],
            'is_active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', ...($this->filled('starts_at') ? ['after:starts_at'] : [])],
        ];
    }

    /**
     * The validated banner, with its dates as UTC instants. The admin sends ISO 8601 times with an offset (the owner's
     * own time zone); they are converted here, so what is stored is always UTC whatever offset arrived (Eloquent
     * would otherwise keep the wall-clock time of the offset that was sent).
     */
    public function banner(): array
    {
        $v = $this->validated();
        foreach (['starts_at', 'ends_at'] as $key) {
            if (array_key_exists($key, $v)) {
                $v[$key] = $v[$key] === null ? null : Carbon::parse($v[$key])->utc();
            }
        }

        return $v;
    }

    public function messages(): array
    {
        return [
            'link_url.regex' => 'Link to a page of the store (starting with /) or a secure https:// address.',
            'image_url.regex' => 'Upload the image, or use a secure https:// address.',
            'image_mobile_url.regex' => 'Upload the image, or use a secure https:// address.',
            'focal_point.regex' => 'Pick the focal point on the image.',
            'link_label.required_with' => 'Say what the link does (for example “Shop the sale”).',
            'ends_at.after' => 'The end must be after the start.',
        ];
    }
}
