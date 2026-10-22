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

    /**
     * What a proposed offer would do to one product (or one variant) at $at, by the same rule as every price: the
     * lowest of the regular price, the own sale and the running offers wins; offers never add up. $offer is the
     * proposal ({discount_type, discount_value, name}); $exclude is the offer being edited (its saved version is
     * replaced by the proposal, not counted twice).
     *
     * @return array{regular: int, current: int, with: int, offer_price: ?int, cheaper_by: ?string} amounts in cents;
     *                                                                                              cheaper_by says what already beats the proposal ("sale" or another offer's name) when it doesn't lower the price
     */
    public static function preview(Product $product, ?ProductVariant $variant, CarbonInterface $at, array $offer, ?int $exclude = null): array
    {
        $regular = Money::cents(($variant ?? $product)->regular_price);
        $sale = $variant ? ($variant->sale_price !== null ? Money::cents($variant->sale_price) : null) : (self::saleActive($product, $at) ? Money::cents($product->sale_price) : null);
        $others = array_values(array_filter(app(Offers::class)->runningFor($product->id, $at), fn ($o) => $o['id'] !== $exclude));
        $current = self::compute($product, $regular, $sale, null, $at, $others);
        $proposed = ['id' => 0, 'name' => $offer['name'] ?? 'This offer', 'label' => null, 'discount_type' => $offer['discount_type'], 'discount_value' => (string) $offer['discount_value'], 'ends_at' => null];
        $with = self::compute($product, $regular, $sale, null, $at, [...$others, $proposed]);
        $offerPrice = self::offerPrice($regular, $offer['discount_type'], (string) $offer['discount_value']);
        $cheaperBy = null;
        if ($offerPrice !== null && $with['price'] >= $current['price'] && $current['price'] < $regular) {
            $cheaperBy = $current['offer'] ? $current['offer']['name'] : 'sale';
        }

        return ['regular' => $regular, 'current' => $current['price'], 'with' => $with['price'], 'offer_price' => $offerPrice, 'cheaper_by' => $cheaperBy];
    }

    /**
     * The rule itself: the regular price, the sale price (if any) and the product's running offers, lowest wins.
     * $offers: the running offers to consider (default: the product's, from Offers).
     */
    private static function compute(Product $product, int $regular, ?int $sale, ?CarbonInterface $saleEndsAt, CarbonInterface $at, ?array $offers = null): array
    {
        $price = $regular;
        $endsAt = null;
        $offer = null;

        if ($sale !== null && $sale < $price) {
            $price = $sale;
            $endsAt = $saleEndsAt;
        }
        foreach ($offers ?? app(Offers::class)->runningFor($product->id, $at) as $o) {
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
