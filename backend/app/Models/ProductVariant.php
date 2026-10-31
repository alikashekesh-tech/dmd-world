<?php

namespace App\Models;

use App\Services\StockAlerts;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One combination a variable product is sold in ("Black / M"), with its own SKU, prices, stock and on/off switch.
 * Prices come from Pricing::forVariant, availability from Inventory; stock_quantity only changes through Inventory.
 * Removing a variant soft-deletes it: past orders and the stock history keep pointing at it.
 */
#[Fillable(['sku', 'options', 'image_url', 'regular_price', 'sale_price', 'track_stock', 'stock_status', 'is_active', 'position'])]
class ProductVariant extends Model
{
    use SoftDeletes;

    /** @var array<string, bool> per connection and database: is live_options_key computed by the database? */
    private static array $liveKeyGenerated = [];

    protected static function booted(): void
    {
        // live_options_key is options_key while the variant is live and NULL once removed, so the unique index
        // (product_id, live_options_key) stops a live combination being sold twice. Databases migrated with the first
        // version of the migration compute it (a stored generated column, which refuses any written value); the
        // others have a plain column that the model fills.
        static::saving(function (ProductVariant $variant) {
            if (! self::liveKeyIsGenerated()) {
                $variant->live_options_key = $variant->deleted_at === null ? $variant->options_key : null;
            } elseif (! $variant->exists) {
                unset($variant->live_options_key);
            } elseif ($variant->isDirty('live_options_key')) {
                $variant->live_options_key = $variant->getOriginal('live_options_key');
            }
        });
        static::saved(fn (ProductVariant $variant) => StockAlerts::afterVariantChange($variant)); // tells buyers waiting for it
        static::deleted(function (ProductVariant $variant) {
            if (! $variant->isForceDeleting() && ! self::liveKeyIsGenerated()) {
                $variant->forceFill(['live_options_key' => null])->saveQuietly();
            }
        });
        static::restored(function (ProductVariant $variant) {
            if (! self::liveKeyIsGenerated()) {
                $variant->forceFill(['live_options_key' => $variant->options_key])->saveQuietly();
            }
        });
    }

    /** True when the database computes live_options_key itself (MySQL or MariaDB generated column). */
    public static function liveKeyIsGenerated(): bool
    {
        $db = (new static)->getConnection();
        $key = $db->getName().'|'.$db->getDatabaseName();
        if (! isset(self::$liveKeyGenerated[$key])) {
            self::$liveKeyGenerated[$key] = in_array($db->getDriverName(), ['mysql', 'mariadb'], true) && $db->selectOne(
                "SELECT 1 AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'live_options_key' AND COALESCE(GENERATION_EXPRESSION, '') <> ''",
                [$db->getTablePrefix().(new static)->getTable()],
            ) !== null;
        }

        return self::$liveKeyGenerated[$key];
    }

    /** Forgets what was found about the column (after the schema changes, e.g. in tests). */
    public static function forgetLiveKeyColumn(): void
    {
        self::$liveKeyGenerated = [];
    }

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
