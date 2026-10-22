<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

/** A product page: the listing fields plus text, specifications, all images and size/weight. */
class ProductDetailResource extends ProductResource
{
    public function toArray(Request $request): array
    {
        $dimensions = array_filter([$this->length_cm, $this->width_cm, $this->height_cm], fn ($v) => $v !== null);

        return parent::toArray($request) + [
            'short_description' => $this->short_description,
            'description' => $this->description,
            'gallery' => $this->images->map(fn ($i) => ['url' => $i->url, 'alt' => $i->alt ?: $this->name])->values(),
            'specifications' => $this->specifications->map(fn ($s) => ['name' => $s->name, 'value' => $s->value])->values(),
            'weight_kg' => $this->weight_kg !== null ? (float) $this->weight_kg : null,
            'dimensions_cm' => count($dimensions) === 3 ? array_map('floatval', array_values($dimensions)) : null,
            'brand' => $this->brand && $this->brand->is_active && ! $this->brand->trashed() ? ['id' => $this->brand->id, 'name' => $this->brand->name, 'slug' => $this->brand->slug] : null,
        ];
    }
}
