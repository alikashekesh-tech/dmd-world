<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A buyer waiting for a sold-out product. notified_at is set once the back-in-stock email has gone. */
class StockAlert extends Model
{
    public const MAX_PER_BUYER = 50;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'product_id' => 'integer', 'notified_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}
