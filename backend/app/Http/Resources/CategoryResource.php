<?php

namespace App\Http\Resources;

use App\Services\CategoryTree;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A category as the storefront sees it. `path` is its storefront URL below /product-category/. */
class CategoryResource extends JsonResource
{
    public function __construct($resource, protected ?CategoryTree $tree = null)
    {
        parent::__construct($resource);
    }

    /** @return list<array<string, mixed>> */
    public static function list(iterable $categories, CategoryTree $tree, ?Request $request = null): array
    {
        return collect($categories)->map(fn ($c) => (new static($c, $tree))->toArray($request ?? request()))->values()->all();
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'parent_id' => $this->parent_id,
            'brand_id' => $this->brand_id,
            'name' => $this->name,
            'slug' => $this->slug,
            'path' => $this->tree?->path($this->id),
            'description' => $this->description,
            'image_url' => $this->image_url,
            'icon' => $this->icon,
            'accent_color' => $this->accent_color,
            'position' => $this->position,
        ];
    }
}
