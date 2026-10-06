<?php

namespace App\Models;

use App\Services\Catalog;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One product image; position 0 is the main image. `url` is absolute, or /storage/… for files uploaded here. */
#[Fillable(['url', 'alt', 'position'])]
class ProductImage extends Model
{
    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalog::bust());
        static::deleted(fn () => Catalog::bust());
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
