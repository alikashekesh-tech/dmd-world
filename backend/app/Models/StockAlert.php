<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Someone waiting for a sold-out product, or one variant of it: a signed-in buyer or a guest who agreed to be told, by
 * email or by phone (WhatsApp/SMS). notified_at is set once they've been told (by the system, or by the owner by hand);
 * cancelled_at when they withdrew it through the private link (token).
 */
class StockAlert extends Model
{
    public const MAX_PER_BUYER = 50;

    protected $guarded = ['*'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer', 'product_id' => 'integer', 'variant_id' => 'integer', 'variant_key' => 'integer',
            'notified_at' => 'datetime', 'consented_at' => 'datetime', 'cancelled_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class)->withTrashed();
    }

    public function scopeWaiting($query)
    {
        return $query->whereNull('notified_at')->whereNull('cancelled_at');
    }
}
