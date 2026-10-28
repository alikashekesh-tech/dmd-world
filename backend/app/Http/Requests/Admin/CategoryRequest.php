<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

/** Adding (POST: name required) or editing (PUT: send only what changes) a category. Tree rules live in CategoryService. */
class CategoryRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        foreach (['slug', 'accent_color'] as $k) {
            if (is_string($this->input($k))) {
                $this->merge([$k => strtolower($this->input($k)) ?: null]);
            }
        }
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:80', 'not_regex:/[<>]/'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'brand_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brands', 'id')->whereNull('deleted_at')],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https://|/storage/)[^\s]+$#i'], // an upload or an https address
            'icon' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'accent_color' => ['sometimes', 'nullable', 'regex:/^#[0-9a-f]{6}$/'],
            'is_visible' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the category a name.',
            'name.not_regex' => 'Leave out < and > in the name.',
            'slug.regex' => 'Use lowercase letters, numbers and single hyphens in the web address.',
            'parent_id.exists' => 'That parent category doesn’t exist (or is archived).',
            'brand_id.exists' => 'That brand doesn’t exist (or is archived).',
            'image_url.url' => 'Use a full image address starting with https://',
            'accent_color.regex' => 'Use a colour like #1f6feb.',
        ] + parent::messages();
    }
}
