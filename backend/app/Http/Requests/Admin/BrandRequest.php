<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;

/** Adding (POST: name required) or editing (PUT: send only what changes) a brand. */
class BrandRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('slug'))) {
            $this->merge(['slug' => strtolower($this->input('slug')) ?: null]);
        }
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:80', 'not_regex:/[<>]/'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'logo_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url:http,https'],
            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the brand a name.',
            'name.not_regex' => 'Leave out < and > in the name.',
            'slug.regex' => 'Use lowercase letters, numbers and single hyphens in the web address.',
            'logo_url.url' => 'Use a full image address starting with https://',
        ] + parent::messages();
    }
}
