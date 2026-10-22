<?php

namespace App\Models;

use App\Services\Catalog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A buyer's review of a product: rating, title and body as plain text. New and edited reviews wait for the owner
 * (pending); only approved ones are shown on the storefront and counted in a product's rating.
 */
class Review extends Model
{
    public const STATUSES = ['pending', 'approved', 'rejected', 'spam'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'user_id' => 'integer',
            'rating' => 'integer',
            'is_verified_purchase' => 'boolean',
            'moderated_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Ratings are part of the storefront catalog: refresh it when an approved review appears, changes or goes.
        static::saved(function (Review $r) {
            if ($r->wasChanged('status') || ($r->status === 'approved' && ($r->wasRecentlyCreated || $r->wasChanged('rating')))) {
                Catalog::bust();
            }
        });
        static::deleted(fn (Review $r) => $r->status === 'approved' ? Catalog::bust() : null);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function moderator(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'moderated_by');
    }

    public function scopeApproved(Builder $query): void
    {
        $query->where('status', 'approved');
    }

    /** How a buyer is named on a public review: first name and last initial ("Rana K."). */
    public static function displayName(User $user): string
    {
        $first = trim((string) $user->first_name);
        $last = trim((string) $user->last_name);

        return mb_substr(($first !== '' ? $first : 'DMD buyer').($last !== '' ? ' '.mb_substr($last, 0, 1).'.' : ''), 0, 80);
    }
}
