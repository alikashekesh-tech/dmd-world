<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A discount code. Its rules are checked by App\Services\Coupons at quote time and again, under a row lock, when
 * the order is placed. How often it has been used is counted from coupon_redemptions, never stored.
 */
class Coupon extends Model
{
    use SoftDeletes;

    public const TYPES = ['percent', 'fixed_cart', 'fixed_product'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2', 'minimum_spend' => 'decimal:2', 'maximum_spend' => 'decimal:2',
            'usage_limit' => 'integer', 'usage_limit_per_customer' => 'integer', 'imported_uses' => 'integer',
            'exclude_sale_items' => 'boolean', 'is_active' => 'boolean', 'starts_at' => 'datetime', 'expires_at' => 'datetime',
        ];
    }

    public function targets(): HasMany
    {
        return $this->hasMany(CouponTarget::class);
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(CouponRedemption::class);
    }

    public static function normalize(?string $code): string
    {
        return mb_strtoupper(trim((string) $code));
    }

    /** "10% off", "$5 off", "$2 off each item". */
    public function label(): string
    {
        $amount = rtrim(rtrim(number_format((float) $this->amount, 2, '.', ''), '0'), '.');

        return match ($this->discount_type) {
            'percent' => $amount.'% off',
            'fixed_product' => '$'.$amount.' off each item',
            default => '$'.$amount.' off',
        };
    }
}
