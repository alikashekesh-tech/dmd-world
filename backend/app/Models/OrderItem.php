<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of an order: the product as it was sold (name, SKU, image, prices, and for a variant its options), kept even
 * if the product or variant changes later.
 */
class OrderItem extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2', 'regular_price' => 'decimal:2', 'line_subtotal' => 'decimal:2',
            'line_discount' => 'decimal:2', 'line_total' => 'decimal:2', 'quantity' => 'integer', 'stock_held' => 'integer', 'product_id' => 'integer',
            'variant_id' => 'integer', 'variant_options' => 'array',
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

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id')->withTrashed();
    }

    /** "Black / M", or null for a simple product's line. */
    public function optionsLabel(): ?string
    {
        return $this->variant_options ? implode(' / ', array_column($this->variant_options, 'value')) : null;
    }

    /** The name as sold, with its options: "DualSense Controller (Black / M)". */
    public function displayName(): string
    {
        $options = $this->optionsLabel();

        return $options ? "{$this->product_name} ({$options})" : $this->product_name;
    }
}
