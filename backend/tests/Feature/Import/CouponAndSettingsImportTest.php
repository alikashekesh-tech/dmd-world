<?php

namespace Tests\Feature\Import;

use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Services\Coupons;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The old store's coupons and settings (fixtures: the emulator's two coupons, one limited to a category and used
 * by two imported orders, one pending and one cancelled; and its settings, with a low-stock level of 4).
 */
class CouponAndSettingsImportTest extends TestCase
{
    use FakesOldStore, RefreshDatabase;

    public function test_coupons_arrive_with_their_ids_rules_and_usage(): void
    {
        $this->importOldStore();
        $woo = collect($this->fixture('coupons'))->keyBy('id');

        $this->assertSame($woo->count(), Coupon::withTrashed()->count());
        $ps4 = Coupon::with('targets')->find(8002);
        $this->assertSame(['PS4GAMES5', 'fixed_cart', '5.00', true], [$ps4->code, $ps4->discount_type, $ps4->amount, $ps4->is_active]);
        $this->assertSame($woo[8002]['product_categories'], $ps4->targets->where('target_type', 'category')->pluck('target_id')->all());
        $this->assertNotNull($ps4->expires_at);
        $welcome = Coupon::find(8001);
        $this->assertSame(['10.00', '20.00', 1], [$welcome->amount, $welcome->minimum_spend, $welcome->usage_limit_per_customer]);

        // Orders that used the code are its redemptions; together with the old count they give the same total.
        $this->assertSame(2, CouponRedemption::where('coupon_id', 8002)->count());
        $this->assertSame($woo[8002]['usage_count'], app(Coupons::class)->uses($ps4), 'the cancelled order doesn’t count, as in the old store');
        $this->assertSame($woo[8001]['usage_count'], app(Coupons::class)->uses($welcome));
    }

    public function test_settings_that_still_matter_carry_over(): void
    {
        $this->importOldStore([], ['settings']);

        $this->assertSame(4, StoreSettings::lowStockThreshold());
        $this->assertTrue(StoreSettings::get('coupons_enabled'));
        $this->assertTrue(StoreSettings::get('reviews_enabled'));
        $this->assertFalse(StoreSettings::get('reviews_require_purchase'));
    }

    public function test_importing_again_updates_instead_of_duplicating(): void
    {
        $this->importOldStore();
        $counts = [Coupon::withTrashed()->count(), CouponRedemption::count()];
        $coupons = $this->fixture('coupons');
        $coupons[0]['status'] = 'trash';
        $coupons[0]['amount'] = '7.00';

        $this->importOldStore(['coupons' => $coupons]);

        $this->assertSame($counts, [Coupon::withTrashed()->count(), CouponRedemption::count()]);
        $c = Coupon::withTrashed()->find($coupons[0]['id']);
        $this->assertSame(['7.00', true], [$c->amount, $c->trashed()]);
    }
}
