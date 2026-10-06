<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Product;
use App\Support\Money;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Every product change goes through here (admin screens, bulk actions, imports), so the rules always hold:
 * sale below the regular price and in a sensible date range, unique SKU and slug, a primary category that is one of
 * the product's categories, and stock changed only through Inventory (with a movement line).
 */
final class ProductService
{
    private const FIELDS = ['brand_id', 'name', 'short_description', 'description', 'regular_price', 'sale_price', 'sale_starts_at',
        'sale_ends_at', 'is_featured', 'track_stock', 'low_stock_threshold', 'stock_status', 'weight_kg', 'length_cm', 'width_cm', 'height_cm'];

    public function __construct(private Inventory $inventory) {}

    public function create(array $data, ?Admin $by = null): Product
    {
        return DB::transaction(function () use ($data, $by) {
            $product = new Product(['status' => 'draft', 'track_stock' => true, 'stock_status' => 'in_stock']);
            $this->apply($product, $data, true);
            if (! empty($data['stock_quantity']) && $product->track_stock) {
                $this->inventory->adjust($product, (int) $data['stock_quantity'], 'adjustment', $by, 'Initial stock');
            }
            Activity::record('product.created', "Added {$product->name}".($product->status === 'published' ? '' : ' as a draft'), $product, $by);

            return $product->refresh();
        });
    }

    public function update(Product $product, array $data, ?Admin $by = null): Product
    {
        return DB::transaction(function () use ($product, $data, $by) {
            $wasPublished = $product->status === 'published';
            $this->apply($product, $data, false);
            if (array_key_exists('stock_quantity', $data) && $product->track_stock) {
                $this->inventory->set($product, (int) $data['stock_quantity'], 'adjustment', $by);
            }
            $what = $wasPublished === ($product->status === 'published') ? 'Updated' : ($product->status === 'published' ? 'Published' : 'Unpublished');
            Activity::record('product.updated', "{$what} {$product->name}", $product, $by);

            return $product->refresh();
        });
    }

    public function archive(Product $product, ?Admin $by = null): void
    {
        $product->delete();
        Activity::record('product.archived', "Archived {$product->name}", $product, $by);
    }

    public function restore(Product $product, ?Admin $by = null): Product
    {
        $product->restore();
        Activity::record('product.restored', "Restored {$product->name}", $product, $by);

        return $product;
    }

    /** Only from the archive. Past orders keep their own copy of the product's name and price. */
    public function destroy(Product $product, ?Admin $by = null): void
    {
        if (! $product->trashed()) {
            throw new ApiException(409, 'NOT_ARCHIVED', 'Archive the product first. Permanent deletion only happens from the archive.');
        }
        $name = $product->name;
        $product->forceDelete();
        Activity::record('product.deleted', "Permanently deleted {$name}", null, $by);
    }

    /** @param list<int> $ids */
    public function bulk(string $action, array $ids, ?Admin $by = null): int
    {
        $products = Product::withTrashed()->whereIn('id', $ids)->get();
        DB::transaction(function () use ($action, $products) {
            foreach ($products as $p) {
                match ($action) {
                    'publish' => $p->trashed() ? null : $p->forceFill(['status' => 'published', 'published_at' => $p->published_at ?? now()])->save(),
                    'unpublish' => $p->forceFill(['status' => 'draft'])->save(),
                    'feature' => $p->forceFill(['is_featured' => true])->save(),
                    'unfeature' => $p->forceFill(['is_featured' => false])->save(),
                    'archive' => $p->trashed() ? null : $p->delete(),
                    'restore' => $p->trashed() ? $p->restore() : null,
                };
            }
        });
        Activity::record("product.bulk.{$action}", ucfirst($action).' '.$products->count().' products', null, $by);

        return $products->count();
    }

    private function apply(Product $product, array $data, bool $creating): void
    {
        $product->fill(array_intersect_key($data, array_flip(self::FIELDS)));

        // Prices: the sale (if any) must be below the price the product will actually have, inside a valid range.
        $regular = Money::cents($product->regular_price);
        if ($product->sale_price !== null && Money::cents($product->sale_price) >= $regular) {
            throw $this->field('sale_price', 'SALE_NOT_LOWER', 'The sale price has to be lower than the regular price.');
        }
        $starts = $product->sale_starts_at ? Carbon::parse($product->sale_starts_at) : null;
        $ends = $product->sale_ends_at ? Carbon::parse($product->sale_ends_at) : null;
        if ($starts && $ends && $ends->lte($starts)) {
            throw $this->field('sale_ends_at', 'SALE_DATES', 'The sale must end after it starts.');
        }

        if (array_key_exists('sku', $data)) {
            $sku = $data['sku'];
            if ($sku !== null && Product::withTrashed()->where('sku', $sku)->whereKeyNot($product->id)->exists()) {
                throw $this->field('sku', 'SKU_TAKEN', "Another product already uses the SKU {$sku}.");
            }
            $product->sku = $sku;
        }

        $slug = ($data['slug'] ?? null) ?? ($creating ? null : $product->slug);
        if ($slug === null) {
            $base = Str::limit(Str::slug($product->name) ?: 'product', 190, '');
            for ($slug = $base, $i = 2; Product::withTrashed()->where('slug', $slug)->whereKeyNot($product->id)->exists(); $i++) {
                $slug = "{$base}-{$i}";
            }
        } elseif (Product::withTrashed()->where('slug', $slug)->whereKeyNot($product->id)->exists()) {
            throw $this->field('slug', 'SLUG_TAKEN', 'Another product already uses this web address.');
        }
        $product->slug = $slug;

        if (array_key_exists('status', $data)) {
            $product->status = $data['status'];
        }
        if ($product->status === 'published' && ! $product->published_at) {
            $product->published_at = now();
        }
        $product->save();

        if (array_key_exists('category_ids', $data) || array_key_exists('primary_category_id', $data)) {
            $ids = array_values(array_map('intval', $data['category_ids'] ?? $product->categories()->pluck('categories.id')->all()));
            $primary = $data['primary_category_id'] ?? $product->categories()->wherePivot('is_primary', true)->value('categories.id');
            if ($primary !== null && ! in_array((int) $primary, $ids, true)) {
                if (array_key_exists('primary_category_id', $data)) {
                    throw $this->field('primary_category_id', 'PRIMARY_NOT_LISTED', 'The main category must be one of the product’s categories.');
                }
                $primary = null;
            }
            $primary ??= $ids[0] ?? null;
            $product->categories()->sync(collect($ids)->mapWithKeys(fn ($id) => [$id => ['is_primary' => $id === (int) $primary]])->all());
        }

        if (array_key_exists('images', $data)) {
            $product->images()->delete();
            foreach (array_values($data['images']) as $position => $image) {
                $product->images()->create(['url' => $image['url'], 'alt' => $image['alt'] ?? null, 'position' => $position]);
            }
        }

        if (array_key_exists('specifications', $data)) {
            $product->specifications()->delete();
            foreach (array_values($data['specifications']) as $position => $spec) {
                $product->specifications()->create(['name' => trim($spec['name']), 'value' => trim($spec['value']), 'position' => $position]);
            }
        }
    }

    private function field(string $field, string $code, string $message): ApiException
    {
        return new ApiException(422, $code, $message, [$field => [$message]]);
    }
}
