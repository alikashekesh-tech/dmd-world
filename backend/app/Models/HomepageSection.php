<?php

namespace App\Models;

use App\Services\Catalog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One section of the storefront home: where it sits and whether it shows. */
class HomepageSection extends Model
{
    /** The sections the storefront knows how to draw, and the kind of item each can be given by hand (if any). */
    public const KEYS = [
        'hero' => null, 'banners' => null, 'recently_viewed' => null, 'platforms' => null,
        'price_drops' => 'product', 'budget' => null, 'world' => 'category', 'ask_us' => null, 'continue' => null,
    ];

    public const MAX_ITEMS = 12;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['position' => 'integer', 'is_visible' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalog::bust());
    }

    public function items(): HasMany
    {
        return $this->hasMany(HomepageItem::class, 'section_key')->orderBy('position');
    }
}
