<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * The one place a selling price is worked out. The catalog, product pages, cart quotes, checkout and the admin all
 * call this, so they can't disagree. The price is the lowest of: the regular price, the product's own sale (inside
 * its dates) and any running store-wide offer covering it. Nothing here ever writes a price back to the product.
 * ProductQuery::priceExpression() is the same rule in SQL, for sorting and filtering.
 * A variant is priced the same way from its own regular and sale price (a variant's sale has no dates); a variable
 * product's price is its "from" price: the cheapest variant that can be bought.
 */
final class Pricing
{
    /** @return array{price: int, regular: int, on_sale: bool, sale_ends_at: ?CarbonInterface, offer: ?array} amounts in cents */
    public static function forProduct(Product $product, ?CarbonInterface $at = null): array
    {
        $at ??= now();
        if ($product->isVariable()) {
            // The cheapest variant that can be bought; if none can, the cheapest one that is switched on.
            $sellable = ($product->relationLoaded('variants') ? $product->variants : $product->variants()->get())->filter->isSellable();
            $buyable = $sellable->filter(fn (ProductVariant $v) => Inventory::variantAvailable($v) !== 0);
            $best = null;
            foreach ($buyable->isNotEmpty() ? $buyable : $sellable as $v) {
                $price = self::forVariant($product, $v, $at);
                if ($best === null || $price['price'] < $best['price']) {
                    $best = $price;
                }
            }
            if ($best !== null) {
                return $best;
            }
        }

        return self::compute($product, Money::cents($product->regular_price), self::saleActive($product, $at) ? Money::cents($product->sale_price) : null, $product->sale_ends_at, $at);
    }

    /** @return array{price: int, regular: int, on_sale: bool, sale_ends_at: ?CarbonInterface, offer: ?array} amounts in cents */
    public static function forVariant(Product $product, ProductVariant $variant, ?CarbonInterface $at = null): array
    {
        return self::compute($product, Money::cents($variant->regular_price), $variant->sale_price !== null ? Money::cents($variant->sale_price) : null, null, $at ?? now());
    }

    /** The rule itself: the regular price, the sale price (if any) and the product's running offers, lowest wins. */
    private static function compute(Product $product, int $regular, ?int $sale, ?CarbonInterface $saleEndsAt, CarbonInterface $at): array
    {
        $price = $regular;
        $endsAt = null;
        $offer = null;

        if ($sale !== null && $sale < $price) {
            $price = $sale;
            $endsAt = $saleEndsAt;
        }
        foreach (app(Offers::class)->runningFor($product->id, $at) as $o) {
            $cents = self::offerPrice($regular, $o['discount_type'], $o['discount_value']);
            if ($cents !== null && $cents < $price) {
                $price = $cents;
                $endsAt = $o['ends_at'] !== null ? Carbon::createFromTimestampUTC($o['ends_at']) : null;
                $offer = ['id' => $o['id'], 'name' => $o['name'], 'label' => $o['label']];
            }
        }

        $onSale = $price < $regular;

        return ['price' => $price, 'regular' => $regular, 'on_sale' => $onSale, 'sale_ends_at' => $onSale ? $endsAt : null, 'offer' => $onSale ? $offer : null];
    }

    public static function saleActive(Product $product, CarbonInterface $at): bool
    {
        return $product->sale_price !== null
            && ($product->sale_starts_at === null || $product->sale_starts_at->lte($at))
            && ($product->sale_ends_at === null || $product->sale_ends_at->gt($at));
    }

    /**
     * A regular price after an offer, in cents, rounded half up (as MySQL's ROUND does in priceExpression).
     * A fixed discount as large as the price doesn't apply: an offer never makes something free.
     */
    public static function offerPrice(int $regular, string $type, string|float|int $value): ?int
    {
        if ($type === 'percent') {
            $basisPoints = (int) round((float) $value * 100);

            return intdiv($regular * (10000 - $basisPoints) + 5000, 10000);
        }
        $off = Money::cents($value);

        return $off < $regular ? $regular - $off : null;
    }
}
