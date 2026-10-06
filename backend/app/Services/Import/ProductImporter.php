<?php

namespace App\Services\Import;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Services\CategoryTree;
use App\Services\Inventory;
use App\Support\Money;
use App\Support\Text;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Brings the old store's products into MySQL (run after the taxonomy):
 *  - product ids stay the WooCommerce ids (/product/<id> links, saved carts, wishlists keep working);
 *  - a brand category becomes the product's brand, the other categories its categories (deepest one = primary);
 *  - images, specifications (visible attributes) and stock come along; stock arrives as an "import" movement line;
 *  - running it again updates the same products (images and specifications are replaced, stock moves by the
 *    difference) instead of duplicating anything.
 * Only simple products exist in the old store; anything else is reported and skipped, never half-imported.
 */
final class ProductImporter
{
    private const OFFERS_CATEGORY = 996; // "New Offers": a merchandising row, never the main category

    private array $stats = ['products' => 0, 'images' => 0, 'skipped' => 0];

    /** @var list<string> */
    public array $warnings = [];

    public function __construct(private Inventory $inventory) {}

    public function import(array $wooProducts): array
    {
        $tree = CategoryTree::load(true);
        $categoryIds = $tree->categories->keys()->flip();
        $brands = Brand::withTrashed()->get()->keyBy('id');
        $brandsBySlug = $brands->keyBy('slug');

        foreach ($wooProducts as $w) {
            $id = (int) ($w['id'] ?? 0);
            $regular = Money::cents($w['regular_price'] ?? '') ?: Money::cents($w['price'] ?? '');
            if (! $id || ($w['type'] ?? 'simple') !== 'simple' || $regular <= 0) {
                $this->stats['skipped']++;
                $this->warnings[] = "Skipped product {$id} (".(($w['type'] ?? 'simple') !== 'simple' ? "type {$w['type']}" : 'no price').')';

                continue;
            }
            $sale = Money::cents($w['sale_price'] ?? '');
            $wooCats = array_map(fn ($c) => (int) $c['id'], $w['categories'] ?? []);
            $brandId = collect($wooCats)->first(fn ($c) => $brands->has($c))
                ?? collect($w['brands'] ?? [])->map(fn ($b) => $brandsBySlug->get($b['slug'] ?? '')?->id)->filter()->first();
            $cats = array_values(array_filter($wooCats, fn ($c) => $categoryIds->has($c)));

            $sku = trim((string) ($w['sku'] ?? '')) ?: null;
            if ($sku !== null && Product::withTrashed()->where('sku', $sku)->whereKeyNot($id)->exists()) {
                $this->warnings[] = "Product {$id}: SKU {$sku} is used by another product, imported without a SKU";
                $sku = null;
            }

            $product = Product::withTrashed()->find($id) ?? new Product;
            $created = Carbon::parse($w['date_created_gmt'] ?? $w['date_created'] ?? 'now', 'UTC');
            $published = ($w['status'] ?? '') === 'publish' && ($w['catalog_visibility'] ?? 'visible') !== 'hidden';
            $product->timestamps = false;
            $product->forceFill([
                'id' => $id,
                'brand_id' => $brandId,
                'name' => Str::limit(html_entity_decode((string) $w['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8'), 200, ''),
                'slug' => $this->slug((string) ($w['slug'] ?? $w['name']), $id),
                'sku' => $sku,
                'short_description' => Text::plain($w['short_description'] ?? '', 1000) ?: null,
                'description' => Text::plain($w['description'] ?? '', 20000) ?: null,
                'regular_price' => Money::decimal($regular),
                'sale_price' => $sale > 0 && $sale < $regular ? Money::decimal($sale) : null,
                'sale_starts_at' => ! empty($w['date_on_sale_from_gmt'] ?? $w['date_on_sale_from'] ?? null) ? Carbon::parse($w['date_on_sale_from_gmt'] ?? $w['date_on_sale_from'], 'UTC') : null,
                'sale_ends_at' => ! empty($w['date_on_sale_to_gmt'] ?? $w['date_on_sale_to'] ?? null) ? Carbon::parse($w['date_on_sale_to_gmt'] ?? $w['date_on_sale_to'], 'UTC') : null,
                'status' => $published ? 'published' : 'draft',
                'is_featured' => (bool) ($w['featured'] ?? false),
                'track_stock' => (bool) ($w['manage_stock'] ?? false),
                'stock_status' => ($w['stock_status'] ?? 'instock') === 'outofstock' ? 'out_of_stock' : 'in_stock',
                'low_stock_threshold' => isset($w['low_stock_amount']) && $w['low_stock_amount'] !== null && $w['low_stock_amount'] !== '' ? max(0, (int) $w['low_stock_amount']) : null,
                'weight_kg' => is_numeric($w['weight'] ?? null) ? $w['weight'] : null,
                'length_cm' => is_numeric($w['dimensions']['length'] ?? null) ? $w['dimensions']['length'] : null,
                'width_cm' => is_numeric($w['dimensions']['width'] ?? null) ? $w['dimensions']['width'] : null,
                'height_cm' => is_numeric($w['dimensions']['height'] ?? null) ? $w['dimensions']['height'] : null,
                'published_at' => $published ? ($product->published_at ?? $created) : $product->published_at,
                'created_at' => $created,
                'updated_at' => Carbon::parse($w['date_modified_gmt'] ?? $w['date_modified'] ?? 'now', 'UTC'),
            ])->save();
            $product->timestamps = true;

            // Categories: the deepest real category is the main one (New Offers is a promotion row, never the main one).
            $primary = collect($cats)->reject(fn ($c) => $c === self::OFFERS_CATEGORY)->sortByDesc(fn ($c) => count($tree->ancestorIds($c)))->first() ?? ($cats[0] ?? null);
            $product->categories()->sync(collect($cats)->mapWithKeys(fn ($c) => [$c => ['is_primary' => $c === $primary]])->all());

            $product->images()->delete();
            foreach (array_values(array_filter($w['images'] ?? [], fn ($i) => Text::httpUrl($i['src'] ?? null))) as $position => $image) {
                $product->images()->create(['url' => $image['src'], 'alt' => Str::limit((string) ($image['alt'] ?? ''), 200, '') ?: null, 'position' => $position]);
                $this->stats['images']++;
            }

            $product->specifications()->delete();
            $position = 0;
            foreach ($w['attributes'] ?? [] as $attribute) {
                $name = Str::limit(trim((string) ($attribute['name'] ?? '')), 80, '');
                $value = Str::limit(implode(', ', array_map('strval', $attribute['options'] ?? [])), 500, '');
                if ($name !== '' && $value !== '' && ($attribute['visible'] ?? true) && ! $product->specifications()->where('name', $name)->exists()) {
                    $product->specifications()->create(['name' => $name, 'value' => $value, 'position' => $position++]);
                }
            }

            if ($product->track_stock) {
                $this->inventory->set($product, max(0, (int) ($w['stock_quantity'] ?? 0)), 'import', null, 'Imported from the old store');
            }
            $this->stats['products']++;
        }

        return $this->stats;
    }

    private function slug(string $wanted, int $id): string
    {
        $base = Str::limit(Str::slug($wanted) ?: 'product', 190, '');
        for ($slug = $base, $i = 2; Product::withTrashed()->where('slug', $slug)->whereKeyNot($id)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
