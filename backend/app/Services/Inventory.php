<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * The only code that changes stock_quantity. Every change locks the product row, can't take stock below zero, and
 * leaves an inventory_movements line with the result. Availability everywhere is read from the same number.
 * A variable product's stock is its variants': each change locks the product row and then the variant row (the same
 * order checkout locks them in), and the product's own columns are kept as their summary.
 */
class Inventory
{
    public const IN_STOCK = 'in_stock';

    public const LOW_STOCK = 'low_stock';

    public const OUT_OF_STOCK = 'out_of_stock';

    /** in_stock | low_stock | out_of_stock, the same rule for the storefront, cart, checkout and admin. */
    public static function availability(Product $product): string
    {
        if (! $product->track_stock) {
            return $product->stock_status === 'out_of_stock' ? self::OUT_OF_STOCK : self::IN_STOCK;
        }
        if ($product->stock_quantity <= 0) {
            return self::OUT_OF_STOCK;
        }

        return $product->stock_quantity <= self::threshold($product) ? self::LOW_STOCK : self::IN_STOCK;
    }

    public static function threshold(Product $product): int
    {
        return $product->low_stock_threshold ?? StoreSettings::lowStockThreshold();
    }

    /** How many can be bought right now (null: not tracked, no limit from stock). */
    public static function available(Product $product): ?int
    {
        if (! $product->track_stock) {
            return $product->stock_status === 'out_of_stock' ? 0 : null;
        }

        return max(0, $product->stock_quantity);
    }

    /** A variant's level: the same rule as a product's, with the product's low-stock threshold. Off or removed: out. */
    public static function variantAvailability(ProductVariant $variant, ?Product $product = null): string
    {
        $available = self::variantAvailable($variant);
        if ($available === 0) {
            return self::OUT_OF_STOCK;
        }
        if ($available === null) {
            return self::IN_STOCK;
        }

        return $available <= self::threshold($product ?? $variant->product) ? self::LOW_STOCK : self::IN_STOCK;
    }

    /** How many of a variant can be bought right now (null: not tracked, no limit from stock; 0 when off or removed). */
    public static function variantAvailable(ProductVariant $variant): ?int
    {
        if (! $variant->isSellable()) {
            return 0;
        }
        if (! $variant->track_stock) {
            return $variant->stock_status === 'out_of_stock' ? 0 : null;
        }

        return max(0, $variant->stock_quantity);
    }

    /** Changes stock by $change (negative to take away). Throws INSUFFICIENT_STOCK instead of going below zero. */
    public function adjust(Product $product, int $change, string $reason, ?Admin $by = null, ?string $note = null, ?int $orderId = null): Product
    {
        return DB::transaction(function () use ($product, $change, $reason, $by, $note, $orderId) {
            /** @var Product $locked */
            $locked = Product::withTrashed()->lockForUpdate()->findOrFail($product->id);
            if ($locked->isVariable()) {
                throw new ApiException(409, 'HAS_VARIANTS', "{$locked->name} is sold in variants: change the stock of each variant instead.");
            }
            $before = $locked->stock_quantity;
            $after = $before + $change;
            if ($after < 0) {
                throw new ApiException(409, 'INSUFFICIENT_STOCK', "Only {$locked->stock_quantity} of {$locked->name} left.");
            }
            if ($change !== 0) {
                $locked->forceFill(['stock_quantity' => $after])->save();
                InventoryMovement::create([
                    'product_id' => $locked->id, 'quantity_change' => $change, 'quantity_after' => $after,
                    'reason' => $reason, 'order_id' => $orderId, 'admin_id' => $by?->id, 'note' => $note,
                ]);
                if ($by) {
                    Activity::record('stock.changed', "Stock for {$locked->name}: {$before} → {$after}", $locked, $by);
                }
            }
            $product->setRawAttributes($locked->getAttributes(), true);

            return $locked;
        });
    }

    /** Changes a variant's stock by $change, like adjust() for a product, and updates the product's summary. */
    public function adjustVariant(ProductVariant $variant, int $change, string $reason, ?Admin $by = null, ?string $note = null, ?int $orderId = null): ProductVariant
    {
        return DB::transaction(function () use ($variant, $change, $reason, $by, $note, $orderId) {
            $product = Product::withTrashed()->lockForUpdate()->findOrFail($variant->product_id); // product first, then variant
            /** @var ProductVariant $locked */
            $locked = ProductVariant::withTrashed()->lockForUpdate()->findOrFail($variant->id);
            $before = $locked->stock_quantity;
            $after = $before + $change;
            $label = $locked->label($product->variation_attributes);
            if ($after < 0) {
                throw new ApiException(409, 'INSUFFICIENT_STOCK', "Only {$before} of {$product->name} ({$label}) left.");
            }
            if ($change !== 0) {
                $locked->forceFill(['stock_quantity' => $after])->save();
                InventoryMovement::create([
                    'product_id' => $product->id, 'variant_id' => $locked->id, 'quantity_change' => $change, 'quantity_after' => $after,
                    'reason' => $reason, 'order_id' => $orderId, 'admin_id' => $by?->id, 'note' => $note,
                ]);
                if ($by) {
                    Activity::record('stock.changed', "Stock for {$product->name} ({$label}): {$before} → {$after}", $product, $by);
                }
                $this->syncSummary($product);
            }
            $variant->setRawAttributes($locked->getAttributes(), true);

            return $locked;
        });
    }

    /** Sets a variant's stock to an exact count (a stocktake), recorded as the difference. */
    public function setVariant(ProductVariant $variant, int $quantity, string $reason = 'adjustment', ?Admin $by = null, ?string $note = null): ProductVariant
    {
        if ($quantity < 0) {
            throw new ApiException(422, 'INVALID_QUANTITY', 'Stock can’t be negative.', ['stock_quantity' => ['Stock can’t be negative.']]);
        }

        return DB::transaction(function () use ($variant, $quantity, $reason, $by, $note) {
            Product::withTrashed()->lockForUpdate()->findOrFail($variant->product_id);
            $current = ProductVariant::withTrashed()->lockForUpdate()->findOrFail($variant->id)->stock_quantity;

            return $this->adjustVariant($variant, $quantity - $current, $reason, $by, $note);
        });
    }

    /**
     * Writes a variable product's summary from its variants that are switched on: in stock without a count if any of
     * them is untracked and in stock, otherwise the total of their stock; the price of the cheapest one (by its own
     * price). Listings, filters, sorting, alerts and the admin's lists read these columns. Call with the product row
     * locked (or inside the transaction that changed the variants).
     */
    public function syncSummary(Product $product): void
    {
        if (! $product->isVariable()) {
            return;
        }
        $on = ProductVariant::where('product_id', $product->id)->where('is_active', true)->get();
        $unlimited = $on->contains(fn (ProductVariant $v) => ! $v->track_stock && $v->stock_status === 'in_stock');
        $total = (int) $on->where('track_stock', true)->sum(fn (ProductVariant $v) => max(0, $v->stock_quantity));
        $summary = ['track_stock' => ! $unlimited, 'stock_quantity' => $total, 'stock_status' => 'in_stock', 'sale_starts_at' => null, 'sale_ends_at' => null];
        $cheapest = $on->sortBy(fn (ProductVariant $v) => min(array_filter([Money::cents($v->regular_price), $v->sale_price !== null ? Money::cents($v->sale_price) : null], fn ($c) => $c !== null)))->first();
        if ($cheapest) {
            $summary += ['regular_price' => $cheapest->regular_price, 'sale_price' => $cheapest->sale_price];
        }
        $product->forceFill($summary)->save();
    }

    /** Sets stock to an exact count (a stocktake), recorded as the difference. */
    public function set(Product $product, int $quantity, string $reason = 'adjustment', ?Admin $by = null, ?string $note = null): Product
    {
        if ($quantity < 0) {
            throw new ApiException(422, 'INVALID_QUANTITY', 'Stock can’t be negative.', ['stock_quantity' => ['Stock can’t be negative.']]);
        }

        return DB::transaction(function () use ($product, $quantity, $reason, $by, $note) {
            $current = Product::withTrashed()->lockForUpdate()->findOrFail($product->id)->stock_quantity;

            return $this->adjust($product, $quantity - $current, $reason, $by, $note);
        });
    }
}
