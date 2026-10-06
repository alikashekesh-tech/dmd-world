<?php

namespace App\Services;

use App\Models\Product;
use App\Support\Money;
use Carbon\CarbonInterface;

/**
 * The one place a selling price is worked out. The catalog, product pages, cart quotes, checkout and the admin all
 * call this, so they can't disagree. A product's own sale applies inside its dates; store-wide offers (Phase 9)
 * plug in here too.
 */
final class Pricing
{
    /** @return array{price: int, regular: int, on_sale: bool, sale_ends_at: ?CarbonInterface} amounts in cents */
    public static function forProduct(Product $product, ?CarbonInterface $at = null): array
    {
        $at ??= now();
        $regular = Money::cents($product->regular_price);
        $price = $regular;
        $endsAt = null;

        if (self::saleActive($product, $at)) {
            $price = min($price, Money::cents($product->sale_price));
            $endsAt = $product->sale_ends_at;
        }

        return ['price' => $price, 'regular' => $regular, 'on_sale' => $price < $regular, 'sale_ends_at' => $price < $regular ? $endsAt : null];
    }

    public static function saleActive(Product $product, CarbonInterface $at): bool
    {
        return $product->sale_price !== null
            && ($product->sale_starts_at === null || $product->sale_starts_at->lte($at))
            && ($product->sale_ends_at === null || $product->sale_ends_at->gt($at));
    }
}
