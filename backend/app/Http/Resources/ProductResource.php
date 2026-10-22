<?php

namespace App\Http\Resources;

use App\Models\ProductVariant;
use App\Services\Inventory;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A product as the storefront lists it (catalog, search, category and brand pages, cart lines). Prices come from
 * Pricing and availability from Inventory, so every view shows the same thing. Exact stock is only shared when
 * it's running low ("Only 2 left"), not the whole inventory. A variable product also lists its attributes and the
 * variants that are switched on, each priced and stocked by the server: the storefront never works a price out.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $price = Pricing::forProduct($this->resource);
        $availability = Inventory::availability($this->resource);
        $images = $this->relationLoaded('images') ? $this->images : collect();
        $categories = $this->relationLoaded('categories') ? $this->categories : collect();
        $variants = $this->isVariable() ? ($this->relationLoaded('variants') ? $this->variants : $this->variants()->get())->filter->isSellable()->values() : collect();

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
            'offer' => $price['offer'] ? ['id' => $price['offer']['id'], 'label' => $price['offer']['label'] ?: $price['offer']['name']] : null,
            'availability' => $availability,
            'stock_left' => $availability === Inventory::LOW_STOCK ? $this->stock_quantity : null,
            // How many can be bought right now: the stock in MySQL when it's tracked (0 when sold out), null when not.
            // Checkout enforces the same number; this lets the quantity controls stop there.
            'max_quantity' => Inventory::available($this->resource),
            'image' => $images->first()?->url,
            'images' => $images->take(6)->pluck('url')->values(),
            'is_featured' => (bool) $this->is_featured,
            'units_sold' => (int) ($this->getAttributes()['units_sold'] ?? 0),
            'rating' => array_key_exists('rating_avg', $this->getAttributes())
                ? ['average' => round((float) $this->getAttributes()['rating_avg'], 2), 'count' => (int) ($this->getAttributes()['rating_count'] ?? 0)]
                : null,
            'published_at' => $this->published_at?->toDateString(),
            'type' => $this->type ?? 'simple',
            // [{name: "Colour", values: ["Black", "White"]}]: what a buyer chooses on the product page.
            'attributes' => $this->isVariable() ? ($this->variation_attributes ?? []) : [],
            'variants' => $variants->map(function (ProductVariant $v) {
                $p = Pricing::forVariant($this->resource, $v);
                $level = Inventory::variantAvailability($v, $this->resource);

                return [
                    'id' => $v->id, 'sku' => $v->sku, 'options' => (object) ($v->options ?? []),
                    'price' => Money::json($p['price']), 'regular_price' => Money::json($p['regular']), 'on_sale' => $p['on_sale'],
                    'discount_percent' => $p['on_sale'] ? (int) round(100 - $p['price'] * 100 / max(1, $p['regular'])) : 0,
                    'availability' => $level, 'stock_left' => $level === Inventory::LOW_STOCK ? $v->stock_quantity : null,
                    'max_quantity' => Inventory::variantAvailable($v),
                ];
            })->values(),
        ];
    }
}
