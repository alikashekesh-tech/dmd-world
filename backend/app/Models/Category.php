<?php

namespace App\Models;

use App\Services\Catalog;
use App\Services\Offers;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A node of the category tree. A top-level category may belong to a brand (one of its product lines); its
 * children inherit that brand. Storefront visibility also depends on the parents and the brand: see CategoryTree.
 */
#[Fillable(['parent_id', 'brand_id', 'name', 'slug', 'description', 'image_url', 'icon', 'accent_color', 'is_visible', 'position'])]
#[Hidden(['parent_key', 'brand_key'])]
class Category extends Model
{
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return ['is_visible' => 'boolean', 'position' => 'integer', 'parent_id' => 'integer', 'brand_id' => 'integer'];
    }

    protected static function booted(): void
    {
        static::saved(function (Category $c) {
            Catalog::bust();
            if ($c->wasRecentlyCreated || $c->wasChanged('parent_id')) {
                Offers::treeChanged(); // an offer on a parent category now covers a different set below it
            }
        });
        static::deleted(fn () => Catalog::bust());
        static::restored(fn () => Catalog::bust());
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class)->withPivot('is_primary');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
