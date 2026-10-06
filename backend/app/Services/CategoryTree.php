<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\Category;
use Illuminate\Support\Collection;

/**
 * The whole category tree in memory (it's small: a few hundred rows at most), built fresh for each use.
 * One place answers "what's the URL path of this category", "is it on the storefront", "what's under it".
 *
 * A category is on the storefront when it, every parent above it and its brand (if any) are visible and not archived.
 */
final class CategoryTree
{
    /** @var Collection<int, Category> */
    public readonly Collection $categories;

    /** @var Collection<int, Brand> */
    public readonly Collection $brands;

    /** @var array<int, list<int>> */
    private array $children = [];

    private array $pathCache = [];

    private array $visibleCache = [];

    private function __construct(Collection $categories, Collection $brands)
    {
        $this->categories = $categories->keyBy('id');
        $this->brands = $brands->keyBy('id');
        foreach ($this->categories as $c) {
            $this->children[$c->parent_id ?? 0][] = $c->id;
        }
    }

    /** $withArchived: the owner's view, which also lists archived categories and brands (never visible). */
    public static function load(bool $withArchived = false): self
    {
        return new self(
            Category::query()->when($withArchived, fn ($q) => $q->withTrashed())->orderBy('position')->orderBy('name')->get(),
            Brand::query()->when($withArchived, fn ($q) => $q->withTrashed())->get(),
        );
    }

    /** "playstation/ps5/games", or "razer/mouse" for a brand's product line. */
    public function path(int $id): string
    {
        if (isset($this->pathCache[$id])) {
            return $this->pathCache[$id];
        }
        $c = $this->categories->get($id);
        if (! $c) {
            return '';
        }
        $prefix = $c->parent_id ? $this->path($c->parent_id) : ($c->brand_id ? (string) $this->brands->get($c->brand_id)?->slug : '');

        return $this->pathCache[$id] = ltrim($prefix.'/'.$c->slug, '/');
    }

    public function isVisible(int $id): bool
    {
        if (array_key_exists($id, $this->visibleCache)) {
            return $this->visibleCache[$id];
        }
        $c = $this->categories->get($id);
        $brand = $c?->brand_id ? $this->brands->get($c->brand_id) : null;
        $visible = $c !== null && $c->is_visible && ! $c->trashed()
            && ($c->parent_id === null || $this->isVisible($c->parent_id))
            && ($c->brand_id === null || ($brand && $brand->is_active && ! $brand->trashed()));

        return $this->visibleCache[$id] = $visible;
    }

    /** @return list<int> the category and everything below it */
    public function descendantIds(int $id): array
    {
        $out = [$id];
        foreach ($this->children[$id] ?? [] as $child) {
            array_push($out, ...$this->descendantIds($child));
        }

        return $out;
    }

    /** @return list<int> direct children, in display order */
    public function childIds(?int $id): array
    {
        return $this->children[$id ?? 0] ?? [];
    }

    /** @return list<int> the parents above a category, top first */
    public function ancestorIds(int $id): array
    {
        $out = [];
        $c = $this->categories->get($id);
        while ($c && $c->parent_id && count($out) < 20) {
            array_unshift($out, $c->parent_id);
            $c = $this->categories->get($c->parent_id);
        }

        return $out;
    }

    /** True when $candidate is $id or sits somewhere below it (used to refuse moving a category into itself). */
    public function isWithin(int $candidate, int $id): bool
    {
        return in_array($candidate, $this->descendantIds($id), true);
    }

    /** The visible category at a storefront URL path ("playstation/ps5/games", "razer/mouse"), or null. */
    public function resolve(string $path): ?Category
    {
        $parts = array_values(array_filter(explode('/', strtolower(trim($path, '/'))), 'strlen'));
        if (! $parts) {
            return null;
        }
        $brand = $this->brands->first(fn (Brand $b) => $b->slug === $parts[0]);
        $parentId = null;
        if ($brand) {
            array_shift($parts);
            if (! $parts) {
                return null; // the brand's own page, not a category
            }
        }
        $found = null;
        foreach ($parts as $i => $slug) {
            $found = $this->categories->first(fn (Category $c) => $c->slug === $slug && $c->parent_id === $parentId
                && ($i > 0 || $c->brand_id === $brand?->id));
            if (! $found) {
                return null;
            }
            $parentId = $found->id;
        }

        return $found && $this->isVisible($found->id) ? $found : null;
    }

    /** @return Collection<int, Category> the categories the storefront shows, in tree order */
    public function visible(): Collection
    {
        return $this->categories->filter(fn (Category $c) => $this->isVisible($c->id))->values();
    }
}
