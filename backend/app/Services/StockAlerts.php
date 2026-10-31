<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockAlert;
use App\Models\User;
use App\Notifications\BackInStock;
use App\Services\Messaging\Outbox;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Throwable;

/**
 * Back-in-stock alerts. A buyer (signed in, or a guest with their consent) asks about a sold-out product or one of its
 * variants, by email or by phone (WhatsApp/SMS). When any change makes it available again (a stock adjustment, a
 * cancelled order returning stock, the owner publishing it…), everyone waiting for exactly that is told once.
 * Each alert is claimed with a conditional UPDATE before it's sent, so two triggers never send twice. A phone alert is
 * only sent through a configured provider; without one it stays waiting for the owner to contact the buyer by hand.
 * `dmd:stock-alerts` (scheduled) retries anything a failure left behind.
 */
class StockAlerts
{
    public const CHANNELS = ['email', 'whatsapp', 'sms'];

    public function __construct(private Outbox $outbox) {}

    /** Called by Product after every save: if the product just became available, tell the waiting buyers after commit. */
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

    /** Called by ProductVariant after every save: a variant back in stock tells the buyers waiting for that variant. */
    public static function afterVariantChange(ProductVariant $variant): void
    {
        if ($variant->wasRecentlyCreated || ! $variant->wasChanged(['stock_quantity', 'stock_status', 'track_stock', 'is_active', 'deleted_at'])) {
            return;
        }
        $before = (new ProductVariant)->setRawAttributes($variant->getRawOriginal());
        if (Inventory::variantAvailable($before) !== 0 || Inventory::variantAvailable($variant) === 0) {
            return;
        }
        $id = $variant->product_id;
        DB::afterCommit(fn () => app(self::class)->send($id));
    }

    /** Published, not archived and not sold out. */
    public static function orderable(Product $product): bool
    {
        return $product->status === 'published' && $product->deleted_at === null
            && Inventory::availability($product) !== Inventory::OUT_OF_STOCK;
    }

    /** What an alert waits for can be bought now: the variant it names, or the product. */
    private static function ready(Product $product, ?ProductVariant $variant): bool
    {
        if (! $variant) {
            return self::orderable($product);
        }

        return $product->status === 'published' && $product->deleted_at === null && $variant->product_id === $product->id
            && $variant->isSellable() && Inventory::variantAvailable($variant) !== 0;
    }

    /** The product (and variant) asked about, if it is sold out now; otherwise there is nothing to wait for. */
    private function soldOut(int $productId, ?int $variantId): array
    {
        $product = Product::published()->find($productId);
        if (! $product) {
            throw new ApiException(404, 'NOT_FOUND', 'That product isn’t available.');
        }
        $variant = null;
        if ($variantId) {
            $variant = ProductVariant::where('product_id', $product->id)->whereKey($variantId)->first();
            if (! $variant || ! $variant->is_active) {
                throw new ApiException(404, 'NOT_FOUND', 'That option of the product isn’t sold.');
            }
        }
        if (self::ready($product, $variant)) {
            $what = $variant ? "{$product->name} ({$variant->label($product->variation_attributes)})" : $product->name;
            throw new ApiException(409, 'IN_STOCK', "{$what} is in stock now, so there’s nothing to wait for.");
        }

        return [$product, $variant];
    }

    /** A signed-in buyer follows a sold-out product (or variant) by email, from their account. */
    public function follow(User $user, int $productId, ?int $variantId = null): StockAlert
    {
        [$product, $variant] = $this->soldOut($productId, $variantId);
        $existing = $user->stockAlerts()->where('product_id', $product->id)->where('variant_key', $variant?->id ?? 0)->first();
        if ($existing) {
            if ($existing->notified_at || $existing->cancelled_at) {
                $existing->forceFill(['notified_at' => null, 'cancelled_at' => null, 'notified_by' => null])->save(); // sold out again: ask again
            }

            return $existing;
        }
        if ($user->stockAlerts()->whereNull('notified_at')->whereNull('cancelled_at')->count() >= StockAlert::MAX_PER_BUYER) {
            throw new ApiException(422, 'TOO_MANY_ALERTS', 'You can follow up to '.StockAlert::MAX_PER_BUYER.' products. Remove one first.');
        }
        DB::table('stock_alerts')->insertOrIgnore(['user_id' => $user->id, 'product_id' => $product->id, 'variant_id' => $variant?->id, 'channel' => 'email',
            'token' => Str::random(40), 'consented_at' => now(), 'created_at' => now(), 'updated_at' => now()]);

        return $user->stockAlerts()->where('product_id', $product->id)->where('variant_key', $variant?->id ?? 0)->firstOrFail();
    }

    /**
     * "Notify me when it's available" from the product page: by email or by phone (WhatsApp/SMS), with the buyer's
     * consent, signed in or not. Asking again for the same thing with the same contact returns the request already
     * waiting instead of adding another, so nobody is told twice.
     *
     * @param  array{product_id: int, variant_id?: ?int, channel: string, email?: ?string, phone?: ?string}  $data
     */
    public function request(array $data, ?User $user): StockAlert
    {
        [$product, $variant] = $this->soldOut((int) $data['product_id'], isset($data['variant_id']) ? (int) $data['variant_id'] : null);
        $channel = $data['channel'];
        $email = $channel === 'email' ? mb_strtolower(trim((string) ($data['email'] ?? $user?->email))) : null;
        $phone = $channel !== 'email' ? trim((string) $data['phone']) : null;

        return DB::transaction(function () use ($product, $variant, $channel, $email, $phone, $user) {
            $same = StockAlert::where('product_id', $product->id)->where('variant_key', $variant?->id ?? 0)
                ->whereNull('notified_at')->whereNull('cancelled_at')->where('channel', $channel)
                ->where(fn ($q) => $user ? $q->where('user_id', $user->id) : $q->whereNull('user_id'))
                ->where($channel === 'email' ? 'email' : 'phone', $channel === 'email' ? $email : $phone)
                ->lockForUpdate()->first();
            if ($same) {
                return $same;
            }
            if ($user) {
                // A signed-in buyer has one request per product and variant: a new channel or contact replaces it.
                $mine = $user->stockAlerts()->where('product_id', $product->id)->where('variant_key', $variant?->id ?? 0)->lockForUpdate()->first();
                if ($mine) {
                    $mine->forceFill(['channel' => $channel, 'email' => $email, 'phone' => $phone, 'consented_at' => now(),
                        'notified_at' => null, 'cancelled_at' => null, 'notified_by' => null])->save();

                    return $mine;
                }
            }
            $alert = new StockAlert;
            $alert->forceFill(['user_id' => $user?->id, 'product_id' => $product->id, 'variant_id' => $variant?->id, 'channel' => $channel,
                'email' => $email, 'phone' => $phone, 'consented_at' => now(), 'token' => Str::random(40)])->save();

            return $alert;
        });
    }

    /** Withdraws a request through its private link (the buyer changed their mind). */
    public function cancel(string $token): void
    {
        $alert = StockAlert::where('token', $token)->first();
        if (! $alert) {
            throw new ApiException(404, 'NOT_FOUND', 'That request was already removed.');
        }
        if (! $alert->cancelled_at && ! $alert->notified_at) {
            $alert->forceFill(['cancelled_at' => now()])->save();
        }
    }

    /** The owner told the buyer themselves (a phone request with no messaging provider set up). */
    public function markContacted(StockAlert $alert, Admin $admin): StockAlert
    {
        if (! $alert->notified_at && ! $alert->cancelled_at) {
            $alert->forceFill(['notified_at' => now(), 'notified_by' => 'admin'])->save();
            Activity::record('stock_alert.contacted', "Told a buyer by {$alert->channel} that product #{$alert->product_id} is back", $alert->product, $admin);
        }

        return $alert;
    }

    /** Tells everyone still waiting on a product (or one of its variants) that can be bought now. Returns how many were sent. */
    public function send(int $productId): int
    {
        $product = Product::find($productId);
        if (! $product || ! self::orderable($product) && ! $product->isVariable()) {
            return 0;
        }
        $variants = $product->isVariable() ? ProductVariant::withTrashed()->where('product_id', $product->id)->get()->keyBy('id') : collect();
        $sent = 0;
        StockAlert::with('user')->where('product_id', $productId)->whereNull('notified_at')->whereNull('cancelled_at')
            ->chunkById(100, function ($alerts) use ($product, $variants, &$sent) {
                foreach ($alerts as $alert) {
                    $variant = $alert->variant_id ? $variants->get($alert->variant_id) : null;
                    if (($alert->variant_id && ! $variant) || ! self::ready($product, $variant)) {
                        continue;
                    }
                    if ($alert->channel !== 'email' && ! $this->outbox->available($alert->channel)) {
                        continue; // no WhatsApp/SMS provider: it waits for the owner (Admin › Back in stock)
                    }
                    // Claim it first: only the request that flips notified_at sends it.
                    if (StockAlert::whereKey($alert->id)->whereNull('notified_at')->whereNull('cancelled_at')->update(['notified_at' => now(), 'notified_by' => 'system']) !== 1) {
                        continue;
                    }
                    if ($this->deliver($alert, $product, $variant)) {
                        $sent++;
                    } else {
                        StockAlert::whereKey($alert->id)->update(['notified_at' => null, 'notified_by' => null]); // try again on the next run
                    }
                }
            });

        return $sent;
    }

    private function deliver(StockAlert $alert, Product $product, ?ProductVariant $variant): bool
    {
        try {
            if ($alert->channel === 'email') {
                $note = new BackInStock($product, $variant, $alert->token);
                $alert->user && ! $alert->email ? $alert->user->notify($note) : Notification::route('mail', $alert->email ?: $alert->user?->email)->notify($note);

                return true;
            }
            $what = $variant ? "{$product->name} ({$variant->label($product->variation_attributes)})" : $product->name;
            $text = "DMD World: {$what} is back in stock. ".config('dmd.frontend_url')."/product/{$product->id}";

            return $this->outbox->send($alert->channel, $alert->phone, $text, 'back_in_stock', $alert) === 'sent';
        } catch (Throwable $e) {
            Log::warning("Back-in-stock alert {$alert->id} for product {$product->id} failed: {$e->getMessage()}");

            return false;
        }
    }

    /** For the scheduled run: every product with someone waiting. */
    public function sendAll(): int
    {
        $sent = 0;
        foreach (StockAlert::whereNull('notified_at')->whereNull('cancelled_at')->distinct()->pluck('product_id') as $productId) {
            $sent += $this->send((int) $productId);
        }

        return $sent;
    }
}
