<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A product or category a coupon is limited to, or excluded from (is_excluded). */
class CouponTarget extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['coupon_id' => 'integer', 'target_id' => 'integer', 'is_excluded' => 'boolean'];
    }
}
