<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One combination a variable product is sold in ("Black / M"), with its own SKU, prices, stock and on/off switch.
 * Prices come from Pricing::forVariant, availability from Inventory; stock_quantity only changes through Inventory.
 * Removing a variant soft-deletes it: past orders and the stock history keep pointing at it.
 */
#[Fillable(['sku', 'options', 'regular_price', 'sale_price', 'track_stock', 'stock_status', 'is_active', 'position'])]
class ProductVariant extends Model
{
    use SoftDeletes;

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'regular_price' => 'decimal:2',
            'sale_price' => 'decimal:2',
            'track_stock' => 'boolean',
            'stock_quantity' => 'integer',
            'is_active' => 'boolean',
            'position' => 'integer',
            'product_id' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    /** The canonical form of a combination: the same options in any order or letter case give the same key. */
    public static function key(array $options): string
    {
        $norm = [];
        foreach ($options as $name => $value) {
            $norm[mb_strtolower(trim((string) $name))] = mb_strtolower(trim((string) $value));
        }
        ksort($norm, SORT_STRING);

        return sha1(json_encode($norm, JSON_UNESCAPED_UNICODE));
    }

    /**
     * The options in the product's attribute order, as name/value pairs (MySQL doesn't keep the key order of a JSON
     * object, so the order comes from the product's attribute list).
     *
     * @return list<array{name: string, value: string}>
     */
    public function optionList(?array $attributes = null): array
    {
        $options = $this->options ?? [];
        $names = array_column($attributes ?? $this->product?->variation_attributes ?? [], 'name');
        $ordered = [];
        foreach ($names as $name) {
            if (array_key_exists($name, $options)) {
                $ordered[] = ['name' => $name, 'value' => (string) $options[$name]];
            }
        }
        foreach ($options as $name => $value) { // anything the attribute list no longer names, after the rest
            if (! in_array($name, $names, true)) {
                $ordered[] = ['name' => (string) $name, 'value' => (string) $value];
            }
        }

        return $ordered;
    }

    /** "Black / M" */
    public function label(?array $attributes = null): string
    {
        return implode(' / ', array_column($this->optionList($attributes), 'value'));
    }

    /** Can be put in a cart: switched on and not removed (stock is checked separately). */
    public function isSellable(): bool
    {
        return $this->is_active && ! $this->trashed();
    }
}
