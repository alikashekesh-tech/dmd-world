<?php

namespace App\Services\Import;

use App\Models\Brand;
use App\Models\Category;
use App\Support\Text;
use Illuminate\Support\Str;

/**
 * Brings the old store's categories into MySQL, laid out the way the storefront shows them
 * (database/import/storefront-taxonomy.php):
 *  - WooCommerce category ids are kept, so links, carts and saved lists that use them keep working;
 *  - brand categories become brands (same id), and their sub-categories that brand's product lines;
 *  - storefront groupings without a WooCommerce category ("Other") are created once and found again by slug;
 *  - categories the storefront menu didn't list are placed under their WooCommerce parent.
 * Running it again updates the same rows instead of adding new ones.
 */
final class TaxonomyImporter
{
    /** WooCommerce category id → ['category'|'brand', our id] */
    private array $placed = [];

    private array $stats = ['brands' => 0, 'categories' => 0, 'groupings' => 0, 'unlisted' => 0];

    /** @var array<int, array> WooCommerce categories by id */
    private array $woo = [];

    public function import(array $wooCategories, array $layout): array
    {
        $this->woo = collect($wooCategories)->keyBy('id')->all();

        foreach ($layout['brands'] ?? [] as $position => $node) {
            $this->brand($node, $position);
        }
        foreach ($layout['categories'] ?? [] as $position => $node) {
            $this->node($node, null, null, $position);
        }
        $this->unlisted();

        return $this->stats;
    }

    private function brand(array $node, int $position): void
    {
        $id = $node['ids'][0] ?? null;
        if (! $id || ! isset($this->woo[$id])) {
            return;
        }
        $brand = Brand::withTrashed()->find($id) ?? new Brand;
        $brand->forceFill([
            'id' => $id,
            'name' => $node['name'],
            'slug' => $node['slug'],
            'description' => $node['description'] ?? (Text::plain($this->woo[$id]['description'] ?? '', 2000) ?: null),
            'logo_url' => Text::httpUrl($node['image_url'] ?? null) ?? Text::httpUrl($this->woo[$id]['image']['src'] ?? null),
            'is_active' => true,
            'position' => $position,
        ])->save();
        $this->placed[$id] = ['brand', $id];
        $this->stats['brands']++;

        foreach ($node['children'] ?? [] as $i => $child) {
            $this->node($child, null, $id, $i);
        }
    }

    private function node(array $node, ?int $parentId, ?int $brandId, int $position): void
    {
        $ids = array_values(array_filter($node['ids'] ?? [], fn ($id) => isset($this->woo[$id])));
        $attrs = [
            'parent_id' => $parentId,
            'brand_id' => $brandId,
            'name' => $node['name'],
            'slug' => $node['slug'],
            'image_url' => Text::httpUrl($node['image_url'] ?? null) ?? Text::httpUrl($this->woo[$ids[0] ?? 0]['image']['src'] ?? null),
            'icon' => $node['icon'] ?? null,
            'accent_color' => isset($node['accent_color']) ? strtolower($node['accent_color']) : null,
            'description' => $node['description'] ?? (isset($ids[0]) ? (Text::plain($this->woo[$ids[0]]['description'] ?? '', 2000) ?: null) : null),
            'is_visible' => true,
            'position' => $position,
        ];

        if ($ids) {
            $category = $this->save($ids[0], $attrs);
            $this->stats['categories']++;
            // Extra WooCommerce categories merged into one storefront entry become its sub-categories.
            foreach (array_slice($ids, 1) as $i => $extra) {
                $name = Text::tidyName($this->woo[$extra]['name']);
                $this->save($extra, ['parent_id' => $category->id, 'brand_id' => $brandId, 'name' => $name, 'slug' => $this->freeSlug($name, $category->id, $brandId, $extra), 'is_visible' => true, 'position' => 100 + $i]);
                $this->stats['categories']++;
            }
        } else {
            // A storefront grouping with no WooCommerce category: found again by its place and slug.
            $category = Category::withTrashed()->where('parent_key', $parentId ?? 0)->where('brand_key', $brandId ?? 0)->where('slug', $node['slug'])->first() ?? new Category;
            $category->forceFill($attrs)->save();
            $this->stats['groupings']++;
        }

        foreach ($node['children'] ?? [] as $i => $child) {
            $this->node($child, $category->id, $brandId, $i);
        }
    }

    /** WooCommerce categories the storefront menu didn't list: under their WooCommerce parent, parents first. */
    private function unlisted(): void
    {
        $pending = array_filter($this->woo, fn ($c) => ! isset($this->placed[$c['id']]));
        for ($guard = 0; $pending && $guard < 20; $guard++) {
            foreach ($pending as $id => $c) {
                $parent = (int) ($c['parent'] ?? 0);
                if ($parent && isset($this->woo[$parent]) && ! isset($this->placed[$parent])) {
                    continue; // its parent first
                }
                [$type, $ref] = $parent && isset($this->placed[$parent]) ? $this->placed[$parent] : [null, null];
                $parentId = $type === 'category' ? $ref : null;
                $brandId = $type === 'brand' ? $ref : ($parentId ? Category::withTrashed()->whereKey($parentId)->value('brand_id') : null);
                $name = Text::tidyName($c['name']);
                $this->save($id, [
                    'parent_id' => $parentId, 'brand_id' => $brandId, 'name' => $name, 'slug' => $this->freeSlug($name, $parentId, $brandId, $id),
                    'description' => Text::plain($c['description'] ?? '', 2000) ?: null, 'image_url' => Text::httpUrl($c['image']['src'] ?? null),
                    'is_visible' => true, 'position' => 1000 + (int) ($c['menu_order'] ?? 0),
                ]);
                $this->stats['unlisted']++;
                unset($pending[$id]);
            }
        }
    }

    private function save(int $id, array $attrs): Category
    {
        $category = Category::withTrashed()->find($id) ?? new Category;
        $category->forceFill(['id' => $id] + $attrs)->save();
        $this->placed[$id] = ['category', $id];

        return $category;
    }

    private function freeSlug(string $name, ?int $parentId, ?int $brandId, int $except): string
    {
        $base = Str::limit(Str::slug($name) ?: 'category', 70, '');
        $slug = $base;
        for ($i = 2; Category::withTrashed()->where('parent_key', $parentId ?? 0)->where('brand_key', $brandId ?? 0)->where('slug', $slug)->whereKeyNot($except)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
