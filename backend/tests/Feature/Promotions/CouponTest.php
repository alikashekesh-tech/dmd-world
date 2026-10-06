<?php

namespace Tests\Feature\Promotions;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/** Discount codes: every rule checked at quote time and again, locked, when the order is placed. */
class CouponTest extends TestCase
{
    use RefreshDatabase;

    private SpaClient $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->owner = $this->owner();
    }

    private function coupon(array $over = []): array
    {
        return $this->owner->post('/api/v1/admin/coupons', ['code' => 'welcome10', 'discount_type' => 'percent', 'amount' => 10, ...$over])->assertCreated()->json('data');
    }

    private function quote(array $items, string $code, ?string $email = null, ?SpaClient $as = null): array
    {
        return ($as ?? $this->client())->post('/api/v1/cart/quote', ['items' => $items, 'coupon' => $code, 'email' => $email])->assertOk()->json('data');
    }

    private function order(array $items, ?string $code, string $email = 'nadim@example.com', ?SpaClient $as = null)
    {
        return ($as ?? $this->client())->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => $items, 'coupon' => $code,
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => $email, 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ]);
    }

    public function test_a_code_is_quoted_then_charged_and_recorded(): void
    {
        $a = Product::factory()->create(['regular_price' => '30.00']);
        $b = Product::factory()->create(['regular_price' => '12.50']);
        $this->coupon(['code' => ' Welcome10 '])['code'] === 'WELCOME10' || $this->fail('codes are stored in capitals');
        $items = [['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 2]];

        $q = $this->quote($items, 'welcome10');
        $this->assertEquals([55, 5.5, 49.5], [$q['subtotal'], $q['discount'], $q['total']]);
        $this->assertSame(['WELCOME10', true, '10% off'], [$q['coupon']['code'], $q['coupon']['ok'], $q['coupon']['label']]);

        $o = $this->order($items, 'WELCOME10')->assertCreated();
        $o->assertJsonPath('data.discount_total', 5.5)->assertJsonPath('data.total', 49.5)->assertJsonPath('data.coupon_code', 'WELCOME10');
        $this->assertEquals([3, 2.5], array_column($o->json('data.items'), 'line_discount'));
        $order = Order::find($o->json('data.id'));
        $this->assertSame(['5.50', 'nadim@example.com'], [CouponRedemption::where('order_id', $order->id)->value('discount'), CouponRedemption::where('order_id', $order->id)->value('email')]);
        $this->assertSame(1, $this->owner->get('/api/v1/admin/coupons')->json('data.0.uses'));
    }

    public function test_codes_that_cannot_be_used_are_reported_and_never_silently_dropped(): void
    {
        $p = Product::factory()->create(['regular_price' => '20.00']);
        $items = [['product_id' => $p->id, 'quantity' => 1]];
        $this->coupon(['code' => 'OLD', 'expires_at' => now()->subDay()->toIso8601String()]);
        $this->coupon(['code' => 'SOON', 'starts_at' => now()->addDay()->toIso8601String()]);
        $this->coupon(['code' => 'OFF', 'is_active' => false]);
        $this->coupon(['code' => 'BIGSPEND', 'minimum_spend' => 50]);
        $this->coupon(['code' => 'SMALLONLY', 'maximum_spend' => 10]);

        foreach (['NOPE' => 'COUPON_INVALID', 'OLD' => 'COUPON_EXPIRED', 'SOON' => 'COUPON_NOT_STARTED', 'OFF' => 'COUPON_INVALID', 'BIGSPEND' => 'COUPON_MIN_SPEND', 'SMALLONLY' => 'COUPON_MAX_SPEND'] as $code => $error) {
            $q = $this->quote($items, $code);
            $this->assertSame([false, $error], [$q['coupon']['ok'], $q['coupon']['error']], $code);
            $this->assertEquals([0, 20], [$q['discount'], $q['total']]);
            $this->order($items, $code)->assertStatus(422)->assertJsonPath('error.code', $error)->assertJsonPath('error.fields.coupon.0', $q['coupon']['message']);
        }
        $this->assertSame(0, Order::count(), 'a refused code places nothing');
        $this->assertSame(10, $p->fresh()->stock_quantity);
    }

    public function test_usage_limits_count_real_orders_and_cancelled_ones_give_the_use_back(): void
    {
        $p = Product::factory()->create(['regular_price' => '20.00']);
        $items = [['product_id' => $p->id, 'quantity' => 1]];
        $this->coupon(['code' => 'ONCE', 'usage_limit' => 1]);
        $this->coupon(['code' => 'EACH', 'usage_limit_per_customer' => 1]);

        $first = $this->order($items, 'ONCE', 'a@example.com')->assertCreated()->json();
        $this->order($items, 'ONCE', 'b@example.com')->assertStatus(422)->assertJsonPath('error.code', 'COUPON_USED_UP');
        $this->client()->post("/api/v1/orders/{$first['data']['id']}/cancel", ['token' => $first['meta']['guest_token']])->assertOk();
        $this->order($items, 'ONCE', 'b@example.com')->assertCreated();

        // Once per customer: by email for guests, by account (or its email) when signed in.
        $this->order($items, 'EACH', 'a@example.com')->assertCreated();
        $this->assertSame('COUPON_CUSTOMER_LIMIT', $this->quote($items, 'EACH', 'A@Example.com')['coupon']['error']);
        $this->order($items, 'EACH', 'a@example.com')->assertStatus(422)->assertJsonPath('error.code', 'COUPON_CUSTOMER_LIMIT');
        $this->order($items, 'EACH', 'c@example.com')->assertCreated();
        $user = User::factory()->create(['email' => 'd@example.com']);
        $buyer = $this->buyer($user);
        $this->order($items, 'EACH', 'other-address@example.com', $buyer)->assertCreated();
        $this->assertSame('COUPON_CUSTOMER_LIMIT', $this->quote($items, 'EACH', null, $buyer)['coupon']['error']);
        $this->order($items, 'EACH', 'yet-another@example.com', $buyer)->assertStatus(422);
    }

    public function test_products_categories_exclusions_and_sale_items(): void
    {
        $consoles = Category::factory()->create();
        $ps5 = Category::factory()->create(['parent_id' => $consoles->id]);
        $console = Product::factory()->create(['regular_price' => '500.00']);
        $console->categories()->attach($ps5->id, ['is_primary' => true]);
        $cable = Product::factory()->create(['regular_price' => '10.00']);
        $onSale = Product::factory()->onSale('8.00')->create(['regular_price' => '10.00']);
        $excluded = Product::factory()->create(['regular_price' => '10.00']);
        $excluded->categories()->attach($ps5->id, ['is_primary' => true]);
        $this->coupon(['code' => 'CONSOLES', 'category_ids' => [$consoles->id], 'excluded_product_ids' => [$excluded->id]]);
        $this->coupon(['code' => 'NOSALE', 'exclude_sale_items' => true]);
        $this->coupon(['code' => 'CABLES', 'product_ids' => [$cable->id]]);
        $line = fn (Product $p, int $qty = 1) => ['product_id' => $p->id, 'quantity' => $qty];

        // Only products below "consoles", minus the excluded one.
        $q = $this->quote([$line($console), $line($cable), $line($excluded)], 'CONSOLES');
        $this->assertEquals(50, $q['discount']);
        $this->assertSame('COUPON_NOT_APPLICABLE', $this->quote([$line($cable)], 'CONSOLES')['coupon']['error']);
        $this->assertEquals(1, $this->quote([$line($cable), $line($onSale)], 'NOSALE')['discount']);
        $this->assertEquals(1, $this->quote([$line($cable), $line($console)], 'CABLES')['discount']);
    }

    public function test_fixed_amounts_never_exceed_what_they_cover_and_add_up_exactly(): void
    {
        $a = Product::factory()->create(['regular_price' => '3.33']);
        $b = Product::factory()->create(['regular_price' => '6.67']);
        $this->coupon(['code' => 'FIVE', 'discount_type' => 'fixed_cart', 'amount' => 5]);
        $this->coupon(['code' => 'HUGE', 'discount_type' => 'fixed_cart', 'amount' => 500]);
        $this->coupon(['code' => 'TWOEACH', 'discount_type' => 'fixed_product', 'amount' => 2]);

        $o = $this->order([['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 1]], 'FIVE')->assertCreated();
        $this->assertEquals(5, $o->json('data.discount_total'));
        $this->assertEqualsWithDelta(5, array_sum(array_column($o->json('data.items'), 'line_discount')), 0.0001, 'line discounts add up to the order’s');
        $this->assertEquals(0, $this->quote([['product_id' => $a->id, 'quantity' => 1]], 'HUGE')['total'], 'never below zero');
        $cheap = Product::factory()->create(['regular_price' => '1.50']);
        $this->assertEquals(4 + 2 + 1.5, $this->quote([['product_id' => $b->id, 'quantity' => 2], ['product_id' => $a->id, 'quantity' => 1], ['product_id' => $cheap->id, 'quantity' => 1]], 'TWOEACH')['discount'], '$2 per unit, capped at the line');
    }

    public function test_codes_can_be_switched_off_store_wide(): void
    {
        $p = Product::factory()->create();
        $this->coupon();
        $this->owner->put('/api/v1/admin/settings', ['coupons_enabled' => false])->assertOk();

        $this->client()->get('/api/v1/checkout/options')->assertJsonPath('data.coupons_enabled', false);
        $this->assertSame('COUPONS_DISABLED', $this->quote([['product_id' => $p->id, 'quantity' => 1]], 'WELCOME10')['coupon']['error']);
        $this->assertFalse(StoreSettings::get('coupons_enabled'));
    }

    public function test_the_owner_manages_codes_and_buyers_cannot(): void
    {
        $this->owner->post('/api/v1/admin/coupons', ['code' => 'has space', 'discount_type' => 'percent', 'amount' => 10])->assertStatus(422);
        $this->owner->post('/api/v1/admin/coupons', ['code' => 'PCT', 'discount_type' => 'percent', 'amount' => 150])->assertStatus(422);
        $this->owner->post('/api/v1/admin/coupons', ['code' => 'SPEND', 'discount_type' => 'fixed_cart', 'amount' => 5, 'minimum_spend' => 50, 'maximum_spend' => 20])->assertStatus(422);
        $c = $this->coupon();
        $this->owner->post('/api/v1/admin/coupons', ['code' => 'Welcome10', 'discount_type' => 'percent', 'amount' => 5])->assertStatus(422)->assertJsonPath('error.fields.code.0', 'Another coupon already uses this code.');
        $this->owner->put("/api/v1/admin/coupons/{$c['id']}", ['code' => 'WELCOME10', 'discount_type' => 'percent', 'amount' => 15])->assertOk()->assertJsonPath('data.label', '15% off');

        // Trash, restore (switched off), and permanent delete only when no order used it.
        $this->owner->delete("/api/v1/admin/coupons/{$c['id']}")->assertNoContent();
        $this->assertSame([], $this->owner->get('/api/v1/admin/coupons')->json('data'));
        $this->owner->post("/api/v1/admin/coupons/{$c['id']}/restore")->assertOk()->assertJsonPath('data.is_active', false);
        $p = Product::factory()->create();
        $used = $this->coupon(['code' => 'USED']);
        $this->order([['product_id' => $p->id, 'quantity' => 1]], 'USED')->assertCreated();
        $this->owner->delete("/api/v1/admin/coupons/{$used['id']}")->assertNoContent();
        $this->owner->delete("/api/v1/admin/coupons/{$used['id']}/permanent")->assertStatus(409)->assertJsonPath('error.code', 'COUPON_IN_USE');
        $this->owner->delete("/api/v1/admin/coupons/{$c['id']}")->assertNoContent();
        $this->owner->delete("/api/v1/admin/coupons/{$c['id']}/permanent")->assertNoContent();
        $this->assertNull(Coupon::withTrashed()->find($c['id']));

        $this->buyer()->get('/api/v1/admin/coupons')->assertUnauthorized();
        $this->client()->post('/api/v1/admin/coupons', ['code' => 'FREE', 'discount_type' => 'percent', 'amount' => 100])->assertUnauthorized();
    }
}
