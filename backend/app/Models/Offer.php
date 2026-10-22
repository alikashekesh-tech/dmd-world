<?php

namespace App\Models;

use App\Services\Offers;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A store-wide discount on chosen products and categories for a period. It never changes a product's own prices:
 * Pricing takes the lowest of the regular price, the product's sale and any running offer.
 */
class Offer extends Model
{
    public const TYPES = ['percent', 'fixed'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['discount_value' => 'decimal:2', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Offers::changed());
        static::deleted(fn () => Offers::changed());
    }

    public function targets(): HasMany
    {
        return $this->hasMany(OfferTarget::class);
    }

    /** Switched on and inside its dates at $at. */
    public function scopeRunning(Builder $query, ?Carbon $at = null): void
    {
        $at ??= now();
        $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $at))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $at));
    }

    /** scheduled | running | ended | off */
    public function state(?Carbon $at = null): string
    {
        $at ??= now();

        return match (true) {
            ! $this->is_active => 'off',
            $this->ends_at !== null && $this->ends_at->lte($at) => 'ended',
            $this->starts_at !== null && $this->starts_at->gt($at) => 'scheduled',
            default => 'running',
        };
    }
}
