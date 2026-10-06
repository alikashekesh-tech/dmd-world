<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Every change to the category tree goes through here, so the rules hold whoever makes the change:
 *  - no category inside itself, at most MAX_DEPTH levels;
 *  - a sub-category belongs to the same brand as its parent;
 *  - siblings have different slugs, and a top-level category never takes a brand's slug (both live at
 *    /product-category/<slug> on the storefront);
 *  - archiving never orphans anything: a category with active sub-categories can't be archived.
 */
final class CategoryService
{
    public const MAX_DEPTH = 5;

    public function create(array $data, ?Admin $by = null): Category
    {
        return DB::transaction(function () use ($data, $by) {
            $category = new Category;
            $this->apply($category, $data, true);
            Activity::record('category.created', "Added category {$category->name}", $category, $by);

            return $category->refresh(); // with the database's defaults (is_visible…)
        });
    }

    public function update(Category $category, array $data, ?Admin $by = null): Category
    {
        return DB::transaction(function () use ($category, $data, $by) {
            $brandBefore = $category->brand_id;
            $this->apply($category, $data, false);
            if ($category->brand_id !== $brandBefore) {
                // The whole branch moves to the new brand (or out of it).
                Category::withTrashed()->whereIn('id', CategoryTree::load()->descendantIds($category->id))->update(['brand_id' => $category->brand_id]);
            }
            Activity::record('category.updated', "Updated category {$category->name}", $category, $by);

            return $category->refresh();
        });
    }

    public function archive(Category $category, ?Admin $by = null): void
    {
        if (Category::where('parent_id', $category->id)->exists()) {
            throw new ApiException(409, 'CATEGORY_HAS_CHILDREN', "Archive or move the sub-categories of {$category->name} first.");
        }
        $category->delete();
        Activity::record('category.archived', "Archived category {$category->name}", $category, $by);
    }

    public function restore(Category $category, ?Admin $by = null): Category
    {
        if ($category->parent_id && ! Category::whereKey($category->parent_id)->exists()) {
            throw new ApiException(409, 'PARENT_ARCHIVED', 'Restore its parent category first.');
        }
        if ($category->brand_id && ! Brand::whereKey($category->brand_id)->exists()) {
            throw new ApiException(409, 'BRAND_ARCHIVED', 'Restore its brand first.');
        }
        $category->restore();
        Activity::record('category.restored', "Restored category {$category->name}", $category, $by);

        return $category;
    }

    /** Only an archived category that nothing uses any more can be removed for good. */
    public function destroy(Category $category, ?Admin $by = null): void
    {
        if (! $category->trashed()) {
            throw new ApiException(409, 'NOT_ARCHIVED', 'Archive the category first. Permanent deletion only happens from the archive.');
        }
        if (Category::withTrashed()->where('parent_id', $category->id)->exists()) {
            throw new ApiException(409, 'CATEGORY_HAS_CHILDREN', 'This category still has sub-categories in the archive.');
        }
        if (method_exists($category, 'products') && $category->products()->withTrashed()->exists()) {
            throw new ApiException(409, 'CATEGORY_IN_USE', 'Products are still filed under this category. Move them first.');
        }
        $name = $category->name;
        $category->forceDelete();
        Activity::record('category.deleted', "Permanently deleted category {$name}", null, $by);
    }

    /** @param list<int> $ids siblings, first to last */
    public function reorder(array $ids, ?Admin $by = null): void
    {
        $rows = Category::whereIn('id', $ids)->get(['id', 'parent_id', 'brand_id']);
        if ($rows->count() !== count($ids) || $rows->unique(fn ($c) => $c->parent_id.'|'.$c->brand_id)->count() > 1) {
            throw new ApiException(422, 'NOT_SIBLINGS', 'Only categories at the same level can be ordered together.');
        }
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $position => $id) {
                Category::whereKey($id)->update(['position' => $position]);
            }
        });
        Activity::record('category.reordered', 'Reordered '.count($ids).' categories', null, $by);
    }

    private function apply(Category $category, array $data, bool $creating): void
    {
        $tree = CategoryTree::load();
        $parentId = array_key_exists('parent_id', $data) ? ($data['parent_id'] ?: null) : $category->parent_id;
        $brandId = array_key_exists('brand_id', $data) ? ($data['brand_id'] ?: null) : $category->brand_id;

        if ($parentId) {
            if (! $creating && $tree->isWithin((int) $parentId, $category->id)) {
                throw $this->field('parent_id', 'CATEGORY_CYCLE', 'A category can’t be moved inside itself.');
            }
            $parent = $tree->categories->get($parentId);
            if (count($tree->ancestorIds($parentId)) + 2 > self::MAX_DEPTH) {
                throw $this->field('parent_id', 'CATEGORY_TOO_DEEP', 'Categories can be nested at most '.self::MAX_DEPTH.' levels deep.');
            }
            if (array_key_exists('brand_id', $data) && $brandId !== null && $brandId !== $parent->brand_id) {
                throw $this->field('brand_id', 'BRAND_MISMATCH', 'A sub-category belongs to the same brand as its parent.');
            }
            $brandId = $parent->brand_id; // inherited
        }

        $name = $data['name'] ?? $category->name;
        // A new category gets a web address from its name; renaming later keeps the address (links keep working)
        // unless a new slug is given.
        $slug = ($data['slug'] ?? null) ?? ($creating ? null : $category->slug);
        $slug ??= $this->freeSlug(Str::slug($name) ?: 'category', $parentId, $brandId, $category->id);

        if ($this->slugTaken($slug, $parentId, $brandId, $category->id)) {
            throw $this->field('slug', 'SLUG_TAKEN', 'Another category at this level already uses this web address.');
        }
        if (! $parentId && ! $brandId && Brand::withTrashed()->where('slug', $slug)->exists()) {
            throw $this->field('slug', 'SLUG_TAKEN', 'A brand already uses this web address. Choose another.');
        }

        $category->fill(array_intersect_key($data, array_flip(['description', 'image_url', 'icon', 'accent_color', 'is_visible', 'position'])));
        $category->forceFill(['name' => $name, 'slug' => $slug, 'parent_id' => $parentId, 'brand_id' => $brandId]);
        if ($creating && ! array_key_exists('position', $data)) {
            $category->position = (int) Category::where('parent_id', $parentId)->where('brand_id', $brandId)->max('position') + 1;
        }
        $category->save();
    }

    private function slugTaken(string $slug, ?int $parentId, ?int $brandId, ?int $except): bool
    {
        return Category::withTrashed()->where('slug', $slug)
            ->where('parent_key', $parentId ?? 0)->where('brand_key', $brandId ?? 0)
            ->when($except, fn ($q) => $q->whereKeyNot($except))->exists();
    }

    private function freeSlug(string $base, ?int $parentId, ?int $brandId, ?int $except): string
    {
        $slug = Str::limit($base, 70, '');
        for ($i = 2; $this->slugTaken($slug, $parentId, $brandId, $except) || (! $parentId && ! $brandId && Brand::withTrashed()->where('slug', $slug)->exists()); $i++) {
            $slug = Str::limit($base, 70, '')."-{$i}";
        }

        return $slug;
    }

    private function field(string $field, string $code, string $message): ApiException
    {
        return new ApiException(422, $code, $message, [$field => [$message]]);
    }
}
