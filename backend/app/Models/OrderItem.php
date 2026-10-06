<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of an order: the product as it was sold (name, SKU, image, prices), kept even if the product changes. */
class OrderItem extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2', 'regular_price' => 'decimal:2', 'line_subtotal' => 'decimal:2',
            'line_discount' => 'decimal:2', 'line_total' => 'decimal:2', 'quantity' => 'integer', 'product_id' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}
