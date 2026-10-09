<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Support\Money;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Every product change goes through here (admin screens, bulk actions, imports), so the rules always hold:
 * sale below the regular price and in a sensible date range, unique SKU and slug, a primary category that is one of
 * the product's categories, and stock changed only through Inventory (with a movement line).
 * A variable product's attributes and variants are saved here too: every combination at most once, SKUs unique across
 * all products and variants, each sale below its own regular price, variant stock changed through Inventory.
 */
final class ProductService
{
    public const MAX_ATTRIBUTES = 3;

    public const MAX_VALUES = 30;

    public const MAX_VARIANTS = 100;

    private const FIELDS = ['brand_id', 'name', 'short_description', 'description', 'regular_price', 'sale_price', 'sale_starts_at',
        'sale_ends_at', 'is_featured', 'track_stock', 'low_stock_threshold', 'stock_status', 'weight_kg', 'length_cm', 'width_cm', 'height_cm'];

    public function __construct(private Inventory $inventory) {}

    public function create(array $data, ?Admin $by = null): Product
    {
        return DB::transaction(function () use ($data, $by) {
            $product = new Product(['status' => 'draft', 'track_stock' => true, 'stock_status' => 'in_stock']);
            $this->apply($product, $data, true, $by);
            if (! empty($data['stock_quantity']) && $product->track_stock && ! $product->isVariable()) {
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
            $this->apply($product, $data, false, $by);
            if (array_key_exists('stock_quantity', $data) && $product->track_stock && ! $product->isVariable()) {
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

    private function apply(Product $product, array $data, bool $creating, ?Admin $by = null): void
    {
        $wasVariable = $product->isVariable();
        $type = $data['type'] ?? ($product->type ?: 'simple');
        $variable = $type === 'variable';
        // A variable product's own price and stock columns are its variants' summary, never set directly.
        $fields = $variable ? array_diff(self::FIELDS, ['regular_price', 'sale_price', 'sale_starts_at', 'sale_ends_at', 'track_stock', 'stock_status']) : self::FIELDS;
        $product->fill(array_intersect_key($data, array_flip($fields)));
        $product->type = $type;

        $plan = null;
        if ($variable) {
            $plan = $this->planVariants($product, $data, $wasVariable);
            // Before the first save, the row needs a valid price: the cheapest variant's (syncSummary keeps it after).
            $cheapest = collect($plan['rows'])->sortBy('own')->first();
            $product->forceFill(['regular_price' => $cheapest['regular_price'], 'sale_price' => $cheapest['sale_price'], 'sale_starts_at' => null, 'sale_ends_at' => null]);
        } elseif ($creating && $product->regular_price === null) {
            throw $this->field('regular_price', 'PRICE_REQUIRED', 'Give the product a price.');
        }

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
            if ($sku !== null && (ProductVariant::where('sku', $sku)->exists() || in_array(mb_strtolower($sku), array_map('mb_strtolower', array_filter(array_column($plan['rows'] ?? [], 'sku'))), true))) {
                throw $this->field('sku', 'SKU_TAKEN', "A variant already uses the SKU {$sku}.");
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

        if ($plan) {
            $this->saveVariants($product, $plan, $by);
        } elseif ($wasVariable) {
            // Back to a simple product: its variants are removed (kept for past orders and the stock history).
            ProductVariant::where('product_id', $product->id)->get()->each(fn (ProductVariant $v) => $this->removeVariant($v));
            $product->forceFill(['variation_attributes' => null])->save();
        }
    }

    /**
     * Checks a variable product's attributes and variants and works out what to save, before anything is written.
     *
     * @return array{attributes: list<array{name: string, values: list<string>}>, rows: list<array>}
     */
    private function planVariants(Product $product, array $data, bool $wasVariable): array
    {
        if (! array_key_exists('attributes', $data) && ! array_key_exists('variants', $data) && $wasVariable) {
            // Nothing about the variants was sent: keep them as they are.
            return ['attributes' => $product->variation_attributes ?? [], 'rows' => $product->variants()->get()->map(fn (ProductVariant $v) => [
                'model' => $v, 'options' => $v->options, 'key' => $v->options_key, 'sku' => $v->sku, 'regular_price' => $v->regular_price, 'sale_price' => $v->sale_price,
                'own' => min(array_filter([Money::cents($v->regular_price), $v->sale_price !== null ? Money::cents($v->sale_price) : null], fn ($c) => $c !== null)),
                'track_stock' => $v->track_stock, 'stock_quantity' => null, 'stock_status' => $v->stock_status, 'is_active' => $v->is_active, 'keep' => true,
            ])->all()];
        }

        // Attributes: 1 to 3, each named once, each with 1 to 30 different values.
        $attributes = [];
        foreach (array_values($data['attributes'] ?? []) as $i => $a) {
            $name = trim((string) ($a['name'] ?? ''));
            if ($name === '') {
                throw $this->field("attributes.{$i}.name", 'ATTRIBUTE_NAME', 'Give every option a name, like Colour or Size.');
            }
            if (in_array(mb_strtolower($name), array_map(fn ($x) => mb_strtolower($x['name']), $attributes), true)) {
                throw $this->field("attributes.{$i}.name", 'ATTRIBUTE_TWICE', "The option {$name} is listed twice.");
            }
            $values = [];
            foreach (array_values($a['values'] ?? []) as $value) {
                $value = trim((string) $value);
                if ($value !== '' && ! in_array(mb_strtolower($value), array_map('mb_strtolower', $values), true)) {
                    $values[] = $value;
                }
            }
            if (! $values) {
                throw $this->field("attributes.{$i}.values", 'ATTRIBUTE_VALUES', "Give {$name} at least one value.");
            }
            if (count($values) > self::MAX_VALUES) {
                throw $this->field("attributes.{$i}.values", 'ATTRIBUTE_VALUES', "{$name} can have at most ".self::MAX_VALUES.' values.');
            }
            $attributes[] = ['name' => $name, 'values' => $values];
        }
        if (! $attributes) {
            throw $this->field('attributes', 'ATTRIBUTES_REQUIRED', 'A product with variants needs at least one option, like Colour or Size.');
        }
        if (count($attributes) > self::MAX_ATTRIBUTES) {
            throw $this->field('attributes', 'ATTRIBUTES_MAX', 'A product can have at most '.self::MAX_ATTRIBUTES.' options.');
        }

        $variants = array_values($data['variants'] ?? []);
        if (! $variants) {
            throw $this->field('variants', 'VARIANTS_REQUIRED', 'Add at least one variant (Generate variants creates one for every combination).');
        }
        if (count($variants) > self::MAX_VARIANTS) {
            throw $this->field('variants', 'VARIANTS_MAX', 'A product can have at most '.self::MAX_VARIANTS.' variants.');
        }

        $existing = $product->exists ? ProductVariant::withTrashed()->where('product_id', $product->id)->get() : collect();
        $rows = [];
        $keys = [];
        $skus = [];
        foreach ($variants as $i => $v) {
            // One value for each option, from that option's values, written the way the option lists it.
            $given = [];
            foreach ((array) ($v['options'] ?? []) as $name => $value) {
                $given[mb_strtolower(trim((string) $name))] = trim((string) $value);
            }
            $options = [];
            foreach ($attributes as $a) {
                $value = $given[mb_strtolower($a['name'])] ?? '';
                $match = collect($a['values'])->first(fn ($x) => mb_strtolower($x) === mb_strtolower($value));
                if ($match === null) {
                    throw $this->field("variants.{$i}.options", 'VARIANT_OPTIONS', 'Variant '.($i + 1).": choose one of the {$a['name']} values.");
                }
                $options[$a['name']] = $match;
            }
            if (count($given) > count($attributes)) {
                throw $this->field("variants.{$i}.options", 'VARIANT_OPTIONS', 'Variant '.($i + 1).' has an option the product doesn’t have.');
            }
            $label = implode(' / ', $options);
            $key = ProductVariant::key($options);
            if (isset($keys[$key])) {
                throw $this->field("variants.{$i}.options", 'DUPLICATE_VARIANT', "There are two {$label} variants. Each combination can only be sold once.");
            }
            $keys[$key] = true;

            $sku = isset($v['sku']) && trim((string) $v['sku']) !== '' ? trim((string) $v['sku']) : null;
            $model = null;
            if (! empty($v['id'])) {
                $model = $existing->firstWhere('id', (int) $v['id']);
                if (! $model) {
                    throw $this->field("variants.{$i}.id", 'VARIANT_NOT_FOUND', "The {$label} variant isn’t one of this product’s variants. Reload the page.");
                }
            }
            if ($sku !== null) {
                if (isset($skus[mb_strtolower($sku)])) {
                    throw $this->field("variants.{$i}.sku", 'SKU_TAKEN', "Two variants use the SKU {$sku}.");
                }
                $skus[mb_strtolower($sku)] = true;
                $parentSku = array_key_exists('sku', $data) ? $data['sku'] : $product->sku;
                if (($parentSku !== null && mb_strtolower($parentSku) === mb_strtolower($sku)) || Product::withTrashed()->where('sku', $sku)->whereKeyNot($product->id ?? 0)->exists()) {
                    throw $this->field("variants.{$i}.sku", 'SKU_TAKEN', "A product already uses the SKU {$sku}.");
                }
                $owner = ProductVariant::where('sku', $sku)->first();
                if ($owner && $owner->product_id !== $product->id) {
                    throw $this->field("variants.{$i}.sku", 'SKU_TAKEN', "Another product’s variant already uses the SKU {$sku}.");
                }
            }

            $regular = Money::cents($v['regular_price'] ?? 0);
            if ($regular <= 0) {
                throw $this->field("variants.{$i}.regular_price", 'PRICE_REQUIRED', "Give the {$label} variant a price above $0.");
            }
            $sale = isset($v['sale_price']) && $v['sale_price'] !== '' && $v['sale_price'] !== null ? Money::cents($v['sale_price']) : null;
            if ($sale !== null && $sale >= $regular) {
                throw $this->field("variants.{$i}.sale_price", 'SALE_NOT_LOWER', "The {$label} sale price has to be lower than its regular price.");
            }
            $tracked = (bool) ($v['track_stock'] ?? true);

            $rows[] = ['model' => $model, 'options' => $options, 'key' => $key, 'sku' => $sku, 'label' => $label,
                'regular_price' => Money::decimal($regular), 'sale_price' => $sale !== null ? Money::decimal($sale) : null, 'own' => $sale ?? $regular,
                'track_stock' => $tracked, 'stock_quantity' => array_key_exists('stock_quantity', $v) && $v['stock_quantity'] !== null ? (int) $v['stock_quantity'] : null,
                'stock_status' => $v['stock_status'] ?? 'in_stock', 'is_active' => (bool) ($v['is_active'] ?? true), 'keep' => false];
        }

        // Rows sent without an id take over the live variant with their combination, or bring a removed one back.
        $claimed = array_filter(array_map(fn ($r) => $r['model']?->id, $rows));
        foreach ($rows as &$r) {
            if ($r['model'] === null) {
                $r['model'] = $existing->first(fn (ProductVariant $e) => ! $e->trashed() && $e->options_key === $r['key'] && ! in_array($e->id, $claimed, true))
                    ?? $existing->first(fn (ProductVariant $e) => $e->trashed() && $e->options_key === $r['key'] && ! in_array($e->id, $claimed, true));
                if ($r['model']) {
                    $claimed[] = $r['model']->id;
                }
            }
        }
        unset($r);

        return ['attributes' => $attributes, 'rows' => $rows, 'converted' => $product->exists && ! $wasVariable];
    }

    /** Writes the planned variants: removed ones first, then changed ones, then new ones; stock through Inventory. */
    private function saveVariants(Product $product, array $plan, ?Admin $by): void
    {
        $product->forceFill(['variation_attributes' => $plan['attributes']])->save();
        if (collect($plan['rows'])->every(fn ($r) => $r['keep'])) {
            $this->inventory->syncSummary($product);

            return;
        }
        if (($plan['converted'] ?? false) && $product->track_stock && $product->stock_quantity > 0) {
            // It was a simple product with stock of its own: from now on stock is kept per variant.
            InventoryMovement::create(['product_id' => $product->id, 'quantity_change' => -$product->stock_quantity, 'quantity_after' => 0, 'reason' => 'adjustment',
                'admin_id' => $by?->id, 'note' => 'Now sold in variants: stock is kept per variant']);
        }
        $kept = array_filter(array_map(fn ($r) => $r['model']?->id, $plan['rows']));
        ProductVariant::where('product_id', $product->id)->whereNotIn('id', $kept ?: [0])->get()->each(fn (ProductVariant $v) => $this->removeVariant($v));

        // Variants whose combination or SKU moves to another row are cleared first, so swaps don't collide.
        foreach ($plan['rows'] as $r) {
            $m = $r['model'];
            if ($m && ($m->options_key !== $r['key'] || $m->sku !== $r['sku'] || $m->trashed())) {
                $m->forceFill(['options_key' => substr(sha1('moving:'.$m->id), 0, 40), 'sku' => null])->save();
            }
        }
        foreach ($plan['rows'] as $position => $r) {
            $m = $r['model'] ?? new ProductVariant(['stock_quantity' => 0]);
            $isNew = ! $m->exists;
            if ($m->trashed()) {
                $m->restore();
            }
            $m->forceFill([
                'product_id' => $product->id, 'options' => $r['options'], 'options_key' => $r['key'], 'sku' => $r['sku'],
                'regular_price' => $r['regular_price'], 'sale_price' => $r['sale_price'], 'track_stock' => $r['track_stock'],
                'stock_status' => $r['track_stock'] ? 'in_stock' : $r['stock_status'], 'is_active' => $r['is_active'], 'position' => $position,
            ])->save();
            if ($r['track_stock'] && $r['stock_quantity'] !== null && $r['stock_quantity'] !== ($isNew ? 0 : $m->stock_quantity)) {
                $isNew ? $this->inventory->adjustVariant($m, $r['stock_quantity'], 'adjustment', $by, 'Initial stock')
                    : $this->inventory->setVariant($m, $r['stock_quantity'], 'adjustment', $by);
            }
        }
        $this->inventory->syncSummary($product);
    }

    /** Takes a variant off sale for good (kept for past orders and the stock history; its SKU is free again). */
    private function removeVariant(ProductVariant $variant): void
    {
        $variant->forceFill(['sku' => null])->save();
        $variant->delete();
    }

    private function field(string $field, string $code, string $message): ApiException
    {
        return new ApiException(422, $code, $message, [$field => [$message]]);
    }
}
