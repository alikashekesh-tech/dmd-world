<?php

namespace App\Models;

use App\Services\Catalog;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Who makes a product. `is_active = false` hides it from the storefront; archiving (soft delete) also hides it from admin lists. */
#[Fillable(['name', 'slug', 'description', 'logo_url', 'is_active', 'position'])]
class Brand extends Model
{
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'position' => 'integer'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalog::bust());
        static::deleted(fn () => Catalog::bust());
        static::restored(fn () => Catalog::bust());
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** The brand's product lines (Razer › Mouse, Razer › Keyboards…). */
    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }

    public function scopeOnStorefront(Builder $query): void
    {
        $query->where('is_active', true);
    }
}
