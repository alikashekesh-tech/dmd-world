<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Every change to brands goes through here (same rules from the admin, imports and tests). */
final class BrandService
{
    public function create(array $data, ?Admin $by = null): Brand
    {
        $brand = new Brand;
        $this->apply($brand, $data, true);
        Activity::record('brand.created', "Added brand {$brand->name}", $brand, $by);

        return $brand->refresh(); // with the database's defaults (is_active…)
    }

    public function update(Brand $brand, array $data, ?Admin $by = null): Brand
    {
        $this->apply($brand, $data, false);
        Activity::record('brand.updated', "Updated brand {$brand->name}", $brand, $by);

        return $brand->refresh();
    }

    /** Archiving hides the brand and its product lines from the storefront; its products keep the brand. */
    public function archive(Brand $brand, ?Admin $by = null): void
    {
        $brand->delete();
        Activity::record('brand.archived', "Archived brand {$brand->name}", $brand, $by);
    }

    public function restore(Brand $brand, ?Admin $by = null): Brand
    {
        $brand->restore();
        Activity::record('brand.restored', "Restored brand {$brand->name}", $brand, $by);

        return $brand;
    }

    public function destroy(Brand $brand, ?Admin $by = null): void
    {
        if (! $brand->trashed()) {
            throw new ApiException(409, 'NOT_ARCHIVED', 'Archive the brand first. Permanent deletion only happens from the archive.');
        }
        if (Category::withTrashed()->where('brand_id', $brand->id)->exists()) {
            throw new ApiException(409, 'BRAND_IN_USE', 'This brand still has product lines. Move or delete them first.');
        }
        if (method_exists($brand, 'products') && $brand->products()->withTrashed()->exists()) {
            throw new ApiException(409, 'BRAND_IN_USE', 'Products still belong to this brand. Change their brand first.');
        }
        $name = $brand->name;
        $brand->forceDelete();
        Activity::record('brand.deleted', "Permanently deleted brand {$name}", null, $by);
    }

    /** @param list<int> $ids first to last */
    public function reorder(array $ids, ?Admin $by = null): void
    {
        if (Brand::whereIn('id', $ids)->count() !== count($ids)) {
            throw new ApiException(422, 'UNKNOWN_BRAND', 'One of those brands doesn’t exist.');
        }
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $position => $id) {
                Brand::whereKey($id)->update(['position' => $position]);
            }
        });
        Activity::record('brand.reordered', 'Reordered '.count($ids).' brands', null, $by);
    }

    private function apply(Brand $brand, array $data, bool $creating): void
    {
        $name = $data['name'] ?? $brand->name;
        $slug = ($data['slug'] ?? null) ?? ($creating ? null : $brand->slug);
        if ($slug === null) {
            $base = Str::limit(Str::slug($name) ?: 'brand', 70, '');
            $slug = $base;
            for ($i = 2; $this->slugTaken($slug, $brand->id); $i++) {
                $slug = "{$base}-{$i}";
            }
        } elseif ($this->slugTaken($slug, $brand->id)) {
            throw new ApiException(422, 'SLUG_TAKEN', 'Another brand or top-level category already uses this web address.', ['slug' => ['Another brand or top-level category already uses this web address.']]);
        }

        $brand->fill(array_intersect_key($data, array_flip(['description', 'logo_url', 'is_active', 'position'])));
        $brand->forceFill(['name' => $name, 'slug' => $slug]);
        if ($creating && ! array_key_exists('position', $data)) {
            $brand->position = (int) Brand::max('position') + 1;
        }
        $brand->save();
    }

    /** Brands and top-level categories share /product-category/<slug> on the storefront. */
    private function slugTaken(string $slug, ?int $except): bool
    {
        return Brand::withTrashed()->where('slug', $slug)->when($except, fn ($q) => $q->whereKeyNot($except))->exists()
            || Category::withTrashed()->whereNull('parent_id')->whereNull('brand_id')->where('slug', $slug)->exists();
    }
}
