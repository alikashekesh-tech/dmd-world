<?php

namespace App\Http\Resources;

use App\Services\Inventory;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A product as the storefront lists it (catalog, search, category and brand pages, cart lines). Prices come from
 * Pricing and availability from Inventory, so every view shows the same thing. Exact stock is only shared when
 * it's running low ("Only 2 left"), not the whole inventory.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $price = Pricing::forProduct($this->resource);
        $availability = Inventory::availability($this->resource);
        $images = $this->relationLoaded('images') ? $this->images : collect();
        $categories = $this->relationLoaded('categories') ? $this->categories : collect();

        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'sku' => $this->sku,
            'brand_id' => $this->brand_id,
            'category_ids' => $categories->pluck('id')->values(),
            'primary_category_id' => $categories->firstWhere('pivot.is_primary', true)?->id ?? $categories->first()?->id,
            'price' => Money::json($price['price']),
            'regular_price' => Money::json($price['regular']),
            'on_sale' => $price['on_sale'],
            'discount_percent' => $price['on_sale'] ? (int) round(100 - $price['price'] * 100 / max(1, $price['regular'])) : 0,
            'sale_ends_at' => $price['sale_ends_at']?->toIso8601String(),
            'availability' => $availability,
            'stock_left' => $availability === Inventory::LOW_STOCK ? $this->stock_quantity : null,
            'image' => $images->first()?->url,
            'images' => $images->take(6)->pluck('url')->values(),
            'is_featured' => (bool) $this->is_featured,
            'units_sold' => (int) ($this->getAttributes()['units_sold'] ?? 0),
            'rating' => array_key_exists('rating_avg', $this->getAttributes())
                ? ['average' => round((float) $this->getAttributes()['rating_avg'], 2), 'count' => (int) ($this->getAttributes()['rating_count'] ?? 0)]
                : null,
            'published_at' => $this->published_at?->toDateString(),
        ];
    }
}
