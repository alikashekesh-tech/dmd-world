<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;

/** A new display order: the ids of sibling records, first to last. */
class ReorderRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer', 'distinct', 'min:1'],
        ];
    }
}
