<?php

namespace Tests\Feature\Admin;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use App\Services\Conversations;
use App\Services\StoreSettings;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The owner's dashboard: real numbers from MySQL, zeros when there's nothing, a bounded number of queries. */
class DashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dmd.timezone' => 'Asia/Beirut']); // UTC+3 in October
        $this->travelTo(Carbon::parse('2026-10-06 12:00:00', 'UTC')); // 15:00 in Beirut
    }

    /** An order placed at a UTC time, with lines [[product|null, qty, unit price]]. */
    private function order(string $placedUtc, string $status, string $email, array $lines, ?User $user = null): Order
    {
        $total = array_sum(array_map(fn ($l) => Money::cents($l[2]) * $l[1], $lines));
        $o = new Order;
        $o->forceFill([
            'number' => 'tmp-'.uniqid(), 'user_id' => $user?->id, 'status' => $status, 'subtotal' => Money::decimal($total), 'discount_total' => '0.00',
            'shipping_total' => '0.00', 'total' => Money::decimal($total), 'payment_method' => 'cod', 'payment_status' => 'unpaid', 'delivery_method' => 'pickup',
            'first_name' => 'Test', 'last_name' => 'Buyer', 'email' => $email, 'phone' => '+961 3 000 000', 'placed_at' => Carbon::parse($placedUtc, 'UTC'),
        ])->save();
        $o->forceFill(['number' => (string) $o->id])->save();
        foreach ($lines as [$p, $qty, $price]) {
            $o->items()->forceCreate(['product_id' => $p?->id, 'product_name' => $p?->name ?? 'Old product', 'unit_price' => $price, 'regular_price' => $price,
                'quantity' => $qty, 'line_subtotal' => Money::decimal(Money::cents($price) * $qty), 'line_discount' => '0.00', 'line_total' => Money::decimal(Money::cents($price) * $qty)]);
        }

        return $o;
    }

    private function dashboard(string $range = '7d'): array
    {
        return $this->owner()->get("/api/v1/admin/dashboard?range={$range}")->assertOk()->json('data');
    }

    public function test_an_empty_store_shows_zeros_and_empty_lists_never_invented_numbers(): void
    {
        $d = $this->dashboard();

        $this->assertEquals(['revenue' => 0, 'prev_revenue' => 0, 'orders' => 0, 'prev_orders' => 0, 'aov' => 0, 'prev_aov' => 0, 'items' => 0, 'prev_items' => 0, 'new_buyers' => 0, 'prev_new_buyers' => 0], $d['kpis']);
        $this->assertCount(7, $d['series']);
        $this->assertSame([0], array_unique(array_column($d['series'], 'orders')));
        $this->assertSame(['value' => null, 'today' => 0, 'today_orders' => 0], $d['target'], 'no target is made up when the owner has not set one');
        $this->assertSame([], $d['top_products']);
        $this->assertSame([], $d['categories']);
        $this->assertSame([], $d['recent_orders']);
        $this->assertSame(0, $d['attention']['pending']['count']);
        $this->assertCount(16, $this->dashboard('today')['series'], 'one bar per hour so far today (00:00–15:00 in Beirut)');
    }

    public function test_revenue_orders_and_buyers_follow_the_definitions(): void
    {
        $a = Product::factory()->create(['name' => 'Controller']);
        $b = Product::factory()->create(['name' => 'Headset']);
        // This week (Beirut days 30 Sep – 6 Oct).
        $this->order('2026-10-06 08:00:00', 'completed', 'rana@example.com', [[$a, 2, '20.00'], [$b, 1, '10.00']]); // 50 paid
        $this->order('2026-10-05 10:00:00', 'processing', 'karim@example.com', [[$a, 1, '20.00']]);                 // 20 paid
        $this->order('2026-10-04 10:00:00', 'pending', 'lea@example.com', [[$b, 1, '10.00']]);                      // counted, unpaid
        $this->order('2026-10-03 10:00:00', 'cancelled', 'sami@example.com', [[$b, 3, '10.00']]);                   // counted, unpaid
        $this->order('2026-10-02 10:00:00', 'failed', 'fail@example.com', [[$b, 1, '10.00']]);                      // not an order
        // The week before (23–29 Sep); Rana's first order was then.
        $this->order('2026-09-25 10:00:00', 'completed', 'rana@example.com', [[$b, 4, '10.00']]);                   // 40 paid
        $this->order('2026-09-29 20:59:00', 'on_hold', 'nour@example.com', [[$a, 1, '20.00']]);                     // 23:59 Beirut, 29 Sep: last week

        $k = $this->dashboard()['kpis'];

        $this->assertEquals([70, 4, 35, 4], [$k['revenue'], $k['orders'], $k['aov'], $k['items']]);
        $this->assertEquals([60, 2, 30, 5], [$k['prev_revenue'], $k['prev_orders'], $k['prev_aov'], $k['prev_items']]);
        $this->assertEquals([3, 2], [$k['new_buyers'], $k['prev_new_buyers']], 'Karim, Léa and Sami are new this week; Rana bought before');
    }

    public function test_days_and_hours_are_the_stores_own(): void
    {
        $p = Product::factory()->create();
        $this->order('2026-10-05 21:30:00', 'completed', 'late@example.com', [[$p, 1, '15.00']]); // 00:30 on 6 Oct in Beirut
        $this->order('2026-10-05 20:30:00', 'completed', 'earlier@example.com', [[$p, 1, '5.00']]); // 23:30 on 5 Oct in Beirut

        $week = $this->dashboard()['series'];
        $this->assertStringStartsWith('2026-10-06T00:00:00+03:00', $week[6]['t']);
        $this->assertEquals([5, 15], [$week[5]['revenue'], $week[6]['revenue']]);

        $today = $this->dashboard('today');
        $this->assertEquals([15, 1], [$today['kpis']['revenue'], $today['kpis']['orders']]);
        $this->assertEquals(15, $today['series'][0]['revenue']);
        StoreSettings::put(['daily_revenue_target' => 200]);
        $this->assertEquals(['value' => 200, 'today' => 15, 'today_orders' => 1], $this->dashboard()['target']);
    }

    public function test_best_sellers_categories_and_brands_come_from_paid_lines(): void
    {
        $razer = Brand::factory()->create(['name' => 'Razer']);
        $games = Category::factory()->create(['name' => 'Games']);
        $ps5 = Category::factory()->create(['name' => 'PS5 games', 'parent_id' => $games->id]);
        $mouse = Product::factory()->create(['name' => 'Viper', 'brand_id' => $razer->id]);
        $game = Product::factory()->create(['name' => 'FC 26']);
        $game->categories()->attach($ps5->id, ['is_primary' => true]);
        $gone = Product::factory()->create(['name' => 'Discontinued']);

        $this->order('2026-10-06 08:00:00', 'completed', 'a@example.com', [[$game, 2, '60.00'], [$mouse, 1, '45.00']]);
        $this->order('2026-10-05 08:00:00', 'processing', 'b@example.com', [[$game, 1, '60.00'], [$gone, 1, '5.00']]);
        $this->order('2026-10-05 09:00:00', 'cancelled', 'c@example.com', [[$mouse, 5, '45.00']]); // not a sale
        $gone->forceDelete();

        $d = $this->dashboard();
        $this->assertSame(['FC 26', 'Viper', 'Discontinued'], array_column($d['top_products'], 'name'));
        $this->assertEquals([3, 180, 2], [$d['top_products'][0]['units'], $d['top_products'][0]['revenue'], $d['top_products'][0]['orders']]);
        $this->assertNull($d['top_products'][2]['id'], 'a deleted product keeps its sales under its old name');

        $cats = collect($d['categories'])->keyBy('name');
        $this->assertEquals([180, 2], [$cats['Games']['revenue'], $cats['Games']['orders']], 'counted at the top of the main category');
        $this->assertEquals(45, $cats['Razer · no category']['revenue'], 'a product filed only under its brand');
        $this->assertEquals(5, $cats['Removed products']['revenue']);
        $this->assertSame([['id' => $razer->id, 'name' => 'Razer', 'units' => 1, 'revenue' => 45, 'orders' => 1]], $d['brands']);
        $this->assertEquals(230, array_sum(array_column($d['categories'], 'revenue')), 'categories add up to the paid lines');
    }

    public function test_what_needs_the_owner(): void
    {
        StoreSettings::put(['low_stock_threshold' => 3]);
        Product::factory()->stock(0)->create(['name' => 'Sold out pad']);
        Product::factory()->stock(2)->create(['name' => 'Last two']);
        Product::factory()->draft()->stock(0)->create(); // not on the storefront: not counted
        $this->order('2026-10-04 09:00:00', 'pending', 'wait@example.com', [[null, 1, '10.00']]);
        $this->order('2026-10-06 09:00:00', 'pending', 'new@example.com', [[null, 1, '10.00']]);
        $this->order('2026-10-06 09:00:00', 'on_hold', 'hold@example.com', [[null, 1, '10.00']]);
        $buyer = User::factory()->create();
        app(Conversations::class)->start($buyer, null, 'Question', 'Do you have the white one?');
        $review = (new Review)->forceFill(['product_id' => Product::factory()->create()->id, 'author_name' => 'Rana K.', 'rating' => 2, 'title' => 'Meh', 'body' => 'Not as described.', 'status' => 'pending']);
        $review->save();
        (new Coupon)->forceFill(['code' => 'ENDING', 'discount_type' => 'percent', 'amount' => '10.00', 'expires_at' => now()->addDay(), 'is_active' => true])->save();

        $a = $this->dashboard()['attention'];
        $this->assertSame(['count' => 2, 'oldest' => '2026-10-04T09:00:00+00:00'], $a['pending']);
        $this->assertSame(1, $a['on_hold']);
        $this->assertSame(['count' => 1, 'sample' => ['Sold out pad']], $a['out_of_stock']);
        $this->assertSame(['count' => 1, 'sample' => ['Last two']], $a['low_stock']);
        $this->assertSame([1, 1, 1], [$a['reviews'], $a['messages'], $a['ending']]);
    }

    public function test_the_number_of_queries_does_not_grow_with_the_store(): void
    {
        config(['session.lottery' => [0, 100]]); // the session clean-up runs on a random 2% of requests: not part of the dashboard
        $owner = $this->owner(); // signed in once, outside what is counted
        $owner->get('/api/v1/admin/dashboard?range=30d')->assertOk();
        $count = function () use ($owner) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $owner->get('/api/v1/admin/dashboard?range=30d')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $seed = function (int $n) {
            $brand = Brand::factory()->create();
            foreach (range(1, $n) as $i) {
                $cat = Category::factory()->create();
                $p = Product::factory()->create(['brand_id' => $brand->id]);
                $p->categories()->attach($cat->id, ['is_primary' => true]);
                $this->order('2026-10-0'.(($i % 5) + 1).' 10:00:00', 'completed', "b{$i}@example.com", [[$p, 1, '10.00']], User::factory()->create());
            }
        };
        $seed(2);
        $small = $count();
        $seed(25);
        $this->assertSame($small, $count(), 'no query per order, product, category or customer');
    }

    public function test_notifications_badges_search_and_activity(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->stock(0)->create(['name' => 'Sold out pad']);
        $o = $this->order('2026-10-06 09:00:00', 'pending', 'rana@example.com', [[$p, 1, '10.00']]);

        $list = $owner->get('/api/v1/admin/notifications')->assertOk();
        $keys = array_column($list->json('data'), 'key');
        $this->assertContains("order-{$o->id}", $keys);
        $this->assertContains("out-{$p->id}", $keys);
        $this->assertSame(count($keys), $list->json('meta.unseen'));

        $owner->post('/api/v1/admin/notifications/seen')->assertOk();
        $this->assertSame(0, $owner->get('/api/v1/admin/notifications')->json('meta.unseen'));
        $owner->post("/api/v1/admin/notifications/out-{$p->id}/dismiss")->assertOk();
        $this->assertNotContains("out-{$p->id}", array_column($owner->get('/api/v1/admin/notifications')->json('data'), 'key'));
        $owner->post('/api/v1/admin/notifications/<script>/dismiss')->assertNotFound();

        $b = $owner->get('/api/v1/admin/badges')->assertOk()->json('data');
        $this->assertSame([1, 1, 0], [$b['pending'], $b['out'], $b['notifications']]);

        $found = $owner->get('/api/v1/admin/search?q=rana')->assertOk()->json('data');
        $this->assertSame([$o->id], array_column($found['orders'], 'id'));
        $this->assertSame([$p->id], array_column($owner->get('/api/v1/admin/search?q=sold out')->json('data.products'), 'id'));
        $owner->get('/api/v1/admin/search?q=x')->assertStatus(422);

        $owner->put('/api/v1/admin/settings', ['store_name' => 'DMD World Beirut'])->assertOk();
        $this->assertSame('settings.updated', $owner->get('/api/v1/admin/activity')->json('data.0.action'));

        foreach (['dashboard', 'badges', 'notifications', 'activity', 'search?q=ab'] as $path) {
            $this->buyer()->get("/api/v1/admin/{$path}")->assertUnauthorized();
            $this->client()->get("/api/v1/admin/{$path}")->assertUnauthorized();
        }
    }
}
