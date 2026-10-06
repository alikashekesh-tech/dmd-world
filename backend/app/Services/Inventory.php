<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * The only code that changes stock_quantity. Every change locks the product row, can't take stock below zero, and
 * leaves an inventory_movements line with the result. Availability everywhere is read from the same number.
 */
final class Inventory
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

    /** Changes stock by $change (negative to take away). Throws INSUFFICIENT_STOCK instead of going below zero. */
    public function adjust(Product $product, int $change, string $reason, ?Admin $by = null, ?string $note = null, ?int $orderId = null): Product
    {
        return DB::transaction(function () use ($product, $change, $reason, $by, $note, $orderId) {
            /** @var Product $locked */
            $locked = Product::withTrashed()->lockForUpdate()->findOrFail($product->id);
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
