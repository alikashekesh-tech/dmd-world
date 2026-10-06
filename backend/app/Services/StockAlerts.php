<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Product;
use App\Models\StockAlert;
use App\Models\User;
use App\Notifications\BackInStock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Back-in-stock alerts. A signed-in buyer follows a sold-out product; when any change makes it available again
 * (a stock adjustment, a cancelled order returning stock, the owner publishing it…), everyone waiting gets one email.
 * Each alert is claimed with a conditional UPDATE before its email is sent, so two triggers never email twice.
 * `dmd:stock-alerts` (scheduled) retries anything an email failure left behind.
 */
class StockAlerts
{
    /** Called by Product after every save: if the product just became available, email the waiting buyers after commit. */
    public static function afterChange(Product $product): void
    {
        if ($product->wasRecentlyCreated || ! $product->wasChanged(['stock_quantity', 'stock_status', 'track_stock', 'status', 'deleted_at'])) {
            return;
        }
        $before = (new Product)->setRawAttributes($product->getRawOriginal());
        if (self::orderable($before) || ! self::orderable($product)) {
            return;
        }
        $id = $product->id;
        DB::afterCommit(fn () => app(self::class)->send($id));
    }

    /** Published, not archived and not sold out. */
    public static function orderable(Product $product): bool
    {
        return $product->status === 'published' && $product->deleted_at === null
            && Inventory::availability($product) !== Inventory::OUT_OF_STOCK;
    }

    public function follow(User $user, int $productId): StockAlert
    {
        $product = Product::published()->find($productId);
        if (! $product) {
            throw new ApiException(404, 'NOT_FOUND', 'That product isn’t available.');
        }
        if (Inventory::availability($product) !== Inventory::OUT_OF_STOCK) {
            throw new ApiException(409, 'IN_STOCK', "{$product->name} is in stock now, so there’s nothing to wait for.");
        }
        $existing = $user->stockAlerts()->where('product_id', $product->id)->first();
        if ($existing) {
            if ($existing->notified_at) {
                $existing->forceFill(['notified_at' => null])->save(); // sold out again: ask again
            }

            return $existing;
        }
        if ($user->stockAlerts()->whereNull('notified_at')->count() >= StockAlert::MAX_PER_BUYER) {
            throw new ApiException(422, 'TOO_MANY_ALERTS', 'You can follow up to '.StockAlert::MAX_PER_BUYER.' products. Remove one first.');
        }
        DB::table('stock_alerts')->insertOrIgnore(['user_id' => $user->id, 'product_id' => $product->id, 'created_at' => now(), 'updated_at' => now()]);

        return $user->stockAlerts()->where('product_id', $product->id)->firstOrFail();
    }

    /** Emails everyone still waiting on a product, if it can be bought now. Returns how many emails went. */
    public function send(int $productId): int
    {
        $product = Product::find($productId);
        if (! $product || ! self::orderable($product)) {
            return 0;
        }
        $sent = 0;
        StockAlert::with('user')->where('product_id', $productId)->whereNull('notified_at')->chunkById(100, function ($alerts) use ($product, &$sent) {
            foreach ($alerts as $alert) {
                // Claim it first: only the request that flips notified_at sends the email.
                if (StockAlert::whereKey($alert->id)->whereNull('notified_at')->update(['notified_at' => now()]) !== 1) {
                    continue;
                }
                try {
                    $alert->user->notify(new BackInStock($product));
                    $sent++;
                } catch (Throwable $e) {
                    StockAlert::whereKey($alert->id)->update(['notified_at' => null]); // try again on the next run
                    Log::warning("Back-in-stock email for product {$product->id} to user {$alert->user_id} failed: {$e->getMessage()}");
                }
            }
        });

        return $sent;
    }

    /** For the scheduled run: every product with someone waiting that can be bought again. */
    public function sendAll(): int
    {
        $sent = 0;
        foreach (StockAlert::whereNull('notified_at')->distinct()->pluck('product_id') as $productId) {
            $sent += $this->send((int) $productId);
        }

        return $sent;
    }
}
