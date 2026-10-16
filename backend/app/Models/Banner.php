<?php

namespace App\Models;

use App\Services\Catalog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/** A promotional banner on the home page, or the announcement line at the top of every page. */
class Banner extends Model
{
    public const PLACEMENTS = ['home', 'announcement'];

    /** How much a home banner's image is darkened behind its text (null: soft). */
    public const OVERLAYS = ['none', 'soft', 'strong'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['position' => 'integer', 'is_active' => 'boolean', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalog::bust());
        static::deleted(fn () => Catalog::bust());
    }

    /** live (showing now), scheduled (starts later), ended (its end has passed) or off (switched off). */
    public function status(?Carbon $at = null): string
    {
        $at ??= now();

        return match (true) {
            ! $this->is_active => 'off',
            $this->ends_at !== null && $this->ends_at->lte($at) => 'ended',
            $this->starts_at !== null && $this->starts_at->gt($at) => 'scheduled',
            default => 'live',
        };
    }

    /** Switched on and inside its dates. */
    public function scopeShowing(Builder $query, ?Carbon $at = null): void
    {
        $at ??= now();
        $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $at))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $at));
    }
}
