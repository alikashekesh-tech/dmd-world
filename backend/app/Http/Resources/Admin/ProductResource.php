<?php

namespace App\Http\Resources\Admin;

use App\Services\CategoryTree;
use App\Services\Inventory;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The owner's view of a product: everything stored, plus the selling price and stock level the storefront shows. */
class ProductResource extends JsonResource
{
    public static ?CategoryTree $tree = null;

    public function toArray(Request $request): array
    {
        $price = Pricing::forProduct($this->resource);
        $detail = $this->relationLoaded('specifications');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'sku' => $this->sku,
            'status' => $this->status,
            'on_storefront' => $this->isPublished(),
            'archived_at' => $this->deleted_at?->toIso8601String(),
            'brand' => $this->brand_id ? ['id' => $this->brand_id, 'name' => $this->brand?->name] : null,
            'categories' => $this->relationLoaded('categories') ? $this->categories->map(fn ($c) => [
                'id' => $c->id, 'name' => $c->name, 'path' => self::$tree?->path($c->id), 'is_primary' => (bool) $c->pivot->is_primary,
            ])->values() : [],
            'regular_price' => Money::json(Money::cents($this->regular_price)),
            'sale_price' => $this->sale_price !== null ? Money::json(Money::cents($this->sale_price)) : null,
            'sale_starts_at' => $this->sale_starts_at?->toIso8601String(),
            'sale_ends_at' => $this->sale_ends_at?->toIso8601String(),
            'price' => Money::json($price['price']),
            'on_sale' => $price['on_sale'],
            'offer' => $price['offer'] ? ['id' => $price['offer']['id'], 'name' => $price['offer']['name']] : null, // the store-wide offer behind the price, if any
            'is_featured' => (bool) $this->is_featured,
            'track_stock' => (bool) $this->track_stock,
            'stock_quantity' => $this->stock_quantity,
            'low_stock_threshold' => $this->low_stock_threshold,
            'effective_low_stock_threshold' => Inventory::threshold($this->resource),
            'stock_status' => $this->stock_status,
            'availability' => Inventory::availability($this->resource),
            'waiting' => $this->when(array_key_exists('waiting', $this->getAttributes()), fn () => (int) $this->getAttributes()['waiting']), // buyers waiting for it
            'image' => $this->relationLoaded('images') ? $this->images->first()?->url : null,
            'images' => $this->relationLoaded('images') ? $this->images->map(fn ($i) => ['id' => $i->id, 'url' => $i->url, 'alt' => $i->alt, 'position' => $i->position])->values() : [],
            'specifications' => $detail ? $this->specifications->map(fn ($s) => ['name' => $s->name, 'value' => $s->value])->values() : null,
            'short_description' => $this->when($detail, $this->short_description),
            'description' => $this->when($detail, $this->description),
            'weight_kg' => $this->weight_kg !== null ? (float) $this->weight_kg : null,
            'length_cm' => $this->length_cm !== null ? (float) $this->length_cm : null,
            'width_cm' => $this->width_cm !== null ? (float) $this->width_cm : null,
            'height_cm' => $this->height_cm !== null ? (float) $this->height_cm : null,
            'published_at' => $this->published_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
