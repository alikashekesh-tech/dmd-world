<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Builder;

/**
 * Filters and sorts for product lists, written once for the storefront and the admin. The selling-price expression
 * is the SQL twin of Pricing::forProduct (sale price inside its dates, else the regular price).
 */
final class ProductQuery
{
    public static function priceExpression(): array
    {
        $now = now()->toDateTimeString();

        return ['CASE WHEN sale_price IS NOT NULL AND (sale_starts_at IS NULL OR sale_starts_at <= ?) AND (sale_ends_at IS NULL OR sale_ends_at > ?) THEN sale_price ELSE regular_price END', [$now, $now]];
    }

    public static function search(Builder $q, string $term): void
    {
        $like = '%'.addcslashes(mb_substr(trim($term), 0, 100), '%_\\').'%';
        $q->where(function (Builder $w) use ($like, $term) {
            $w->where('name', 'like', $like)->orWhere('sku', 'like', $like)
                ->orWhereHas('brand', fn (Builder $b) => $b->where('name', 'like', $like));
            if (ctype_digit(trim($term))) {
                $w->orWhere('id', (int) trim($term));
            }
        });
    }

    /** Products in a category or anywhere below it. */
    public static function inCategory(Builder $q, int $categoryId, CategoryTree $tree): void
    {
        $ids = $tree->descendantIds($categoryId);
        $q->whereHas('categories', fn (Builder $c) => $c->whereIn('categories.id', $ids));
    }

    public static function inStock(Builder $q): void
    {
        $q->where(fn (Builder $w) => $w->where(fn ($t) => $t->where('track_stock', true)->where('stock_quantity', '>', 0))
            ->orWhere(fn ($u) => $u->where('track_stock', false)->where('stock_status', 'in_stock')));
    }

    /** out | low | in | untracked: the same levels as Inventory::availability. */
    public static function stockLevel(Builder $q, string $level): void
    {
        $default = StoreSettings::lowStockThreshold();
        match ($level) {
            'out' => $q->where(fn (Builder $w) => $w->where(fn ($t) => $t->where('track_stock', true)->where('stock_quantity', '<=', 0))
                ->orWhere(fn ($u) => $u->where('track_stock', false)->where('stock_status', 'out_of_stock'))),
            'low' => $q->where('track_stock', true)->where('stock_quantity', '>', 0)->whereRaw('stock_quantity <= COALESCE(low_stock_threshold, ?)', [$default]),
            'in' => $q->where(fn (Builder $w) => $w->where(fn ($t) => $t->where('track_stock', true)->whereRaw('stock_quantity > COALESCE(low_stock_threshold, ?)', [$default]))
                ->orWhere(fn ($u) => $u->where('track_stock', false)->where('stock_status', 'in_stock'))),
            'untracked' => $q->where('track_stock', false),
            default => null,
        };
    }

    public static function priceBetween(Builder $q, ?float $min, ?float $max): void
    {
        [$sql, $bindings] = self::priceExpression();
        if ($min !== null) {
            $q->whereRaw("({$sql}) >= ?", [...$bindings, $min]);
        }
        if ($max !== null) {
            $q->whereRaw("({$sql}) <= ?", [...$bindings, $max]);
        }
    }

    public static function onSale(Builder $q): void
    {
        [$sql, $bindings] = self::priceExpression();
        $q->whereRaw("({$sql}) < regular_price", $bindings);
    }

    public static function sort(Builder $q, ?string $sort): void
    {
        [$sql, $bindings] = self::priceExpression();
        match ($sort) {
            'price_asc' => $q->orderByRaw("({$sql}) asc", $bindings),
            'price_desc' => $q->orderByRaw("({$sql}) desc", $bindings),
            'name' => $q->orderBy('name'),
            'featured' => $q->orderByDesc('is_featured')->orderByDesc('published_at'),
            'best' => $q->withUnitsSold()->orderByDesc('units_sold')->orderByDesc('published_at'),
            'rated' => $q->orderByRaw('rating_avg IS NULL')->orderByDesc('rating_avg')->orderByDesc('rating_count'), // needs withRating()
            'updated' => $q->orderByDesc('updated_at'),
            'stock' => $q->orderBy('stock_quantity'),
            default => $q->orderByDesc('published_at'),
        };
        $q->orderByDesc('id');
    }
}
