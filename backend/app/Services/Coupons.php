<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;

/**
 * Discount codes: every rule is checked here, for a cart quote and again when the order is placed (then with the
 * coupon row locked, so the last allowed use can't be taken twice). Usage is counted from redemptions of orders
 * that weren't cancelled or failed, plus uses the old store recorded that no imported order accounts for.
 */
final class Coupons
{
    /** Orders whose redemption no longer counts as a use. */
    private const NOT_COUNTED = ['cancelled', 'failed'];

    /**
     * Checks a code against priced cart lines (from Checkout::price) and works out the discount.
     *
     * @return array{coupon: Coupon, discount: int, lines: array<int, int>, label: string} cents; lines: product id → discount
     *
     * @throws ApiException with a message written for the buyer
     */
    public function apply(string $code, array $lines, ?User $user, ?string $email, bool $lock = false, ?CarbonInterface $at = null): array
    {
        $fail = fn (string $error, string $message) => new ApiException(422, $error, $message, ['coupon' => [$message]]);
        if (! StoreSettings::get('coupons_enabled')) {
            throw $fail('COUPONS_DISABLED', 'Discount codes can’t be used right now.');
        }
        $query = Coupon::query()->with('targets')->where('code', Coupon::normalize($code));
        $coupon = ($lock ? $query->lockForUpdate() : $query)->first();
        if (! $coupon || ! $coupon->is_active) {
            throw $fail('COUPON_INVALID', 'That code isn’t valid.');
        }
        $at ??= now();
        if ($coupon->starts_at && $coupon->starts_at->gt($at)) {
            throw $fail('COUPON_NOT_STARTED', 'That code isn’t active yet.');
        }
        if ($coupon->expires_at && $coupon->expires_at->lte($at)) {
            throw $fail('COUPON_EXPIRED', 'That code has expired.');
        }

        $priced = array_filter($lines, fn ($l) => $l['problem'] === null);
        $subtotal = array_sum(array_column($priced, 'subtotal'));
        if ($coupon->minimum_spend !== null && $subtotal < Money::cents($coupon->minimum_spend)) {
            throw $fail('COUPON_MIN_SPEND', 'Spend at least $'.Money::decimal(Money::cents($coupon->minimum_spend)).' to use this code.');
        }
        if ($coupon->maximum_spend !== null && $subtotal > Money::cents($coupon->maximum_spend)) {
            throw $fail('COUPON_MAX_SPEND', 'This code works on orders up to $'.Money::decimal(Money::cents($coupon->maximum_spend)).'.');
        }
        if ($coupon->usage_limit !== null && $this->uses($coupon) >= $coupon->usage_limit) {
            throw $fail('COUPON_USED_UP', 'That code has been used up.');
        }
        // Per customer: by account and by email. A quote without an email yet can't tell; checkout always can.
        if ($coupon->usage_limit_per_customer !== null && ($user || $email) && $this->usesBy($coupon, $user, $email) >= $coupon->usage_limit_per_customer) {
            throw $fail('COUPON_CUSTOMER_LIMIT', 'You’ve already used this code.');
        }

        $eligible = $this->eligible($coupon, $priced);
        if (! $eligible) {
            throw $fail('COUPON_NOT_APPLICABLE', 'That code doesn’t apply to the items in your cart.');
        }
        $perLine = $this->discounts($coupon, $eligible);

        return ['coupon' => $coupon, 'discount' => array_sum($perLine), 'lines' => $perLine, 'label' => $coupon->label()];
    }

    /** Uses that count against the total limit. */
    public function uses(Coupon $coupon): int
    {
        return $coupon->imported_uses + $this->counted($coupon)->count();
    }

    /** Uses by one buyer: their account, or any order with their email. */
    public function usesBy(Coupon $coupon, ?User $user, ?string $email): int
    {
        $email = User::normalizeEmail($email ?? $user?->email);

        return $this->counted($coupon)->where(fn (Builder $w) => $w->when($user, fn ($q) => $q->where('coupon_redemptions.user_id', $user->id))
            ->when($email !== '', fn ($q) => $q->orWhere('coupon_redemptions.email', $email)))->count();
    }

    private function counted(Coupon $coupon): Builder
    {
        return CouponRedemption::query()->where('coupon_id', $coupon->id)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', self::NOT_COUNTED));
    }

    /** The lines the coupon covers: its products and categories (all if none are picked), minus its exclusions. */
    private function eligible(Coupon $coupon, array $lines): array
    {
        $ids = fn (string $type, bool $excluded) => $coupon->targets->where('target_type', $type)->where('is_excluded', $excluded)->pluck('target_id')->map(fn ($v) => (int) $v)->all();
        $onlyProducts = $ids('product', false);
        $onlyCategories = Offers::withDescendants($ids('category', false));
        $notProducts = $ids('product', true);
        $notCategories = Offers::withDescendants($ids('category', true));

        return array_values(array_filter($lines, function ($l) use ($coupon, $onlyProducts, $onlyCategories, $notProducts, $notCategories) {
            $categories = $l['product']->categories->pluck('id')->all();
            $included = (! $onlyProducts && ! $onlyCategories) || in_array($l['product_id'], $onlyProducts, true) || array_intersect($categories, $onlyCategories);
            $excluded = in_array($l['product_id'], $notProducts, true) || array_intersect($categories, $notCategories)
                || ($coupon->exclude_sale_items && $l['unit'] < $l['regular']);

            return $included && ! $excluded;
        }));
    }

    /** @return array<int, int> product id → discount in cents, never more than the line itself */
    private function discounts(Coupon $coupon, array $lines): array
    {
        $amount = Money::cents($coupon->amount);
        $out = [];
        if ($coupon->discount_type === 'percent') {
            $basisPoints = (int) round((float) $coupon->amount * 100);
            foreach ($lines as $l) {
                $out[$l['product_id']] = min($l['subtotal'], intdiv($l['subtotal'] * $basisPoints + 5000, 10000));
            }
        } elseif ($coupon->discount_type === 'fixed_product') {
            foreach ($lines as $l) {
                $out[$l['product_id']] = min($l['subtotal'], $amount * $l['quantity']);
            }
        } else { // fixed_cart: spread over the covered lines by their share, the last line taking the remainder
            $base = array_sum(array_column($lines, 'subtotal'));
            $total = min($amount, $base);
            $given = 0;
            foreach ($lines as $i => $l) {
                $share = $i === count($lines) - 1 ? $total - $given : intdiv($total * $l['subtotal'], max(1, $base));
                $out[$l['product_id']] = $share;
                $given += $share;
            }
        }

        return $out;
    }

    /** Records that an order used a coupon (inside the order's transaction). */
    public function redeem(Coupon $coupon, Order $order, int $discount): void
    {
        (new CouponRedemption)->forceFill([
            'coupon_id' => $coupon->id, 'order_id' => $order->id, 'user_id' => $order->user_id,
            'email' => $order->email, 'discount' => Money::decimal($discount),
        ])->save();
    }
}
