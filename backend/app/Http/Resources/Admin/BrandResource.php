<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\BrandResource as StorefrontBrand;
use Illuminate\Http\Request;

class BrandResource extends StorefrontBrand
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'is_active' => (bool) $this->is_active,
            'product_line_count' => $this->whenCounted('categories'),
            'archived_at' => $this->deleted_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
