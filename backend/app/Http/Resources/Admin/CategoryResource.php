<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\CategoryResource as StorefrontCategory;
use Illuminate\Http\Request;

/** The owner's view of a category: the storefront fields plus visibility, archive state and housekeeping. */
class CategoryResource extends StorefrontCategory
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'is_visible' => (bool) $this->is_visible,
            // Visible on the storefront right now (its parents and brand must be visible too).
            'on_storefront' => ! $this->trashed() && (bool) $this->tree?->isVisible($this->id),
            'children_count' => $this->tree ? count($this->tree->childIds($this->id)) : null,
            'archived_at' => $this->deleted_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
