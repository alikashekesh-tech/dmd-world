<?php

namespace App\Services\Import;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\CouponTarget;
use App\Models\Order;
use App\Models\Product;
use App\Support\Money;
use App\Support\Text;
use Illuminate\Support\Carbon;

/**
 * The old store's coupons: same ids and codes (in capitals), amounts, limits, product and category rules, expiry,
 * and whether each was on, off or in the trash. Imported orders that used a code become its redemptions; uses the
 * old store counted beyond those are kept as imported_uses, so usage limits carry over exactly.
 * Run after products, categories and orders; running it again updates the same coupons.
 */
final class CouponImporter
{
    private const TYPES = ['percent' => 'percent', 'fixed_cart' => 'fixed_cart', 'fixed_product' => 'fixed_product'];

    private array $stats = ['coupons' => 0, 'redemptions' => 0, 'skipped' => 0];

    /** @var list<string> */
    public array $warnings = [];

    public function import(array $wooCoupons): array
    {
        $products = Product::withTrashed()->pluck('id')->flip();
        $categories = Category::withTrashed()->pluck('id')->flip();

        foreach ($wooCoupons as $w) {
            $id = (int) ($w['id'] ?? 0);
            $type = self::TYPES[$w['discount_type'] ?? ''] ?? null;
            $code = Coupon::normalize($w['code'] ?? '');
            $amount = Money::cents($w['amount'] ?? 0);
            if (! $id || ! $type || $code === '' || $amount <= 0 || ($type === 'percent' && $amount > 10000)) {
                $this->stats['skipped']++;
                $this->warnings[] = "Skipped coupon {$id} ({$code}): no usable discount";

                continue;
            }
            $min = Money::cents($w['minimum_amount'] ?? 0);
            $max = Money::cents($w['maximum_amount'] ?? 0);
            $created = Carbon::parse($w['date_created_gmt'] ?? $w['date_created'] ?? 'now', 'UTC');

            $coupon = Coupon::withTrashed()->find($id) ?? new Coupon;
            $coupon->timestamps = false;
            $coupon->forceFill([
                'id' => $id, 'code' => $code, 'description' => Text::line(Text::plain($w['description'] ?? ''), 255) ?: null,
                'discount_type' => $type, 'amount' => Money::decimal($amount),
                'minimum_spend' => $min > 0 ? Money::decimal($min) : null,
                'maximum_spend' => $max > 0 && $max >= $min ? Money::decimal($max) : null,
                'usage_limit' => ! empty($w['usage_limit']) ? (int) $w['usage_limit'] : null,
                'usage_limit_per_customer' => ! empty($w['usage_limit_per_user']) ? (int) $w['usage_limit_per_user'] : null,
                'exclude_sale_items' => (bool) ($w['exclude_sale_items'] ?? false),
                'expires_at' => ! empty($w['date_expires_gmt'] ?? $w['date_expires'] ?? null) ? Carbon::parse($w['date_expires_gmt'] ?? $w['date_expires'], 'UTC') : null,
                'is_active' => ($w['status'] ?? 'publish') === 'publish',
                'deleted_at' => ($w['status'] ?? '') === 'trash' ? ($coupon->deleted_at ?? now()) : null,
                'created_at' => $coupon->created_at ?? $created, 'updated_at' => now(),
            ])->save();
            $coupon->timestamps = true;

            CouponTarget::where('coupon_id', $id)->delete();
            $rows = [];
            foreach ([['product_ids', 'product', false, $products], ['excluded_product_ids', 'product', true, $products],
                ['product_categories', 'category', false, $categories], ['excluded_product_categories', 'category', true, $categories]] as [$field, $targetType, $excluded, $known]) {
                foreach (array_unique(array_map('intval', $w[$field] ?? [])) as $target) {
                    if ($known->has($target)) {
                        $rows[] = ['coupon_id' => $id, 'target_type' => $targetType, 'target_id' => $target, 'is_excluded' => $excluded];
                    } else {
                        $this->warnings[] = "Coupon {$code}: {$targetType} {$target} wasn’t imported, rule dropped";
                    }
                }
            }
            CouponTarget::insert($rows);

            // Orders that used it, as redemptions; whatever the old count says beyond them stays as imported uses.
            $orders = Order::query()->where('coupon_code', $code)->get(['id', 'user_id', 'email', 'discount_total', 'status']);
            foreach ($orders as $order) {
                $r = CouponRedemption::where('order_id', $order->id)->first() ?? new CouponRedemption;
                $r->forceFill(['coupon_id' => $id, 'order_id' => $order->id, 'user_id' => $order->user_id, 'email' => $order->email, 'discount' => $order->discount_total, 'created_at' => $r->created_at ?? now()])->save();
                $this->stats['redemptions']++;
            }
            $counted = $orders->whereNotIn('status', ['cancelled', 'failed'])->count();
            $coupon->forceFill(['imported_uses' => max(0, (int) ($w['usage_count'] ?? 0) - $counted)])->saveQuietly();
            $this->stats['coupons']++;
        }

        return $this->stats;
    }
}
