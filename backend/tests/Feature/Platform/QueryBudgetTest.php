<?php

namespace Tests\Feature\Platform;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Performance guard: the pages people open most run the same number of queries whether the store holds 2 or 8 of
 * everything (no query per product, order, image, review, message or customer).
 */
class QueryBudgetTest extends TestCase
{
    use RefreshDatabase;

    private const STOREFRONT = ['/api/v1/catalog', '/api/v1/products?per_page=50', '/api/v1/brands', '/api/v1/categories'];

    private const BUYER = ['/api/v1/orders', '/api/v1/wishlist', '/api/v1/account/conversations', '/api/v1/account/reviews', '/api/v1/account/stock-alerts'];

    private const OWNER = [
        '/api/v1/admin/products', '/api/v1/admin/orders', '/api/v1/admin/customers', '/api/v1/admin/customers?type=guest', '/api/v1/admin/reviews',
        '/api/v1/admin/inventory', '/api/v1/admin/conversations', '/api/v1/admin/categories', '/api/v1/admin/brands', '/api/v1/admin/stock-alerts',
        '/api/v1/admin/trash', '/api/v1/admin/notifications', '/api/v1/admin/badges', '/api/v1/admin/search?q=pad', '/api/v1/admin/activity',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        config(['session.lottery' => [0, 100]]); // the random session clean-up is not part of any page
    }

    /** n more of everything, made the way buyers make it (through the API). */
    private function grow(int $n, SpaClient $me): void
    {
        $brand = Brand::factory()->create();
        foreach (range(1, $n) as $_) {
            Cache::flush(); // rate limits: this is many buyers' worth of activity in a second
            $cat = Category::factory()->create();
            $pad = Product::factory()->create(['name' => 'Pad '.Str::random(6), 'brand_id' => $brand->id, 'stock_quantity' => 50]);
            $pad->categories()->attach($cat->id, ['is_primary' => true]);
            $pad->images()->createMany([['url' => '/storage/a.png', 'position' => 0], ['url' => '/storage/b.png', 'position' => 1]]);
            $soldOut = Product::factory()->stock(0)->create(['stock_status' => 'out_of_stock']);
            $soldOut->delete(); // also something in the trash
            $soldOut->restore();
            Product::factory()->create()->delete();

            $order = $me->post('/api/v1/orders', $this->checkout($pad, 'me@example.com'))->assertCreated()->json('data.id');
            $me->post('/api/v1/account/conversations', ['order_id' => $order, 'body' => 'Please call before delivery.'])->assertCreated();
            $me->post('/api/v1/account/reviews', ['product_id' => $pad->id, 'rating' => 5, 'title' => 'Good pad', 'body' => 'Works well, good grip.'])->assertCreated();
            $me->post('/api/v1/account/stock-alerts', ['product_id' => $soldOut->id])->assertCreated();
            $me->post('/api/v1/wishlist', ['product_id' => $pad->id])->assertSuccessful();
            $this->client()->post('/api/v1/orders', $this->checkout($pad, 'guest'.Str::random(6).'@example.com'))->assertCreated();
            User::factory()->create();
        }
        Review::query()->update(['status' => 'approved']);
    }

    private function checkout(Product $p, string $email): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Maya', 'last_name' => 'Khoury', 'email' => $email, 'phone' => '+961 71 000 111'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ];
    }

    /** @return array<string, int> queries per page, measured warm (sessions, settings) but with the catalog rebuilt */
    private function measure(SpaClient $guest, SpaClient $me, SpaClient $owner): array
    {
        $out = [];
        foreach ([[$guest, self::STOREFRONT], [$me, self::BUYER], [$owner, self::OWNER]] as [$browser, $uris]) {
            foreach ($uris as $uri) {
                $browser->get($uri)->assertOk();
                Cache::forever('catalog:version', uniqid()); // the catalog is rebuilt, not read from its cache
                DB::flushQueryLog();
                DB::enableQueryLog();
                $browser->get($uri)->assertOk();
                $out[$uri] = count(DB::getQueryLog());
                DB::disableQueryLog();
            }
        }
        $pad = Product::query()->where('name', 'like', 'Pad %')->first();
        foreach (["/api/v1/products/{$pad->id}", "/api/v1/products/{$pad->id}/reviews"] as $uri) {
            $guest->get($uri)->assertOk();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $guest->get($uri)->assertOk();
            $out['/api/v1/products/{id}'.substr($uri, strlen("/api/v1/products/{$pad->id}"))] = count(DB::getQueryLog());
            DB::disableQueryLog();
        }

        return $out;
    }

    public function test_the_busiest_pages_do_not_run_more_queries_as_the_store_grows(): void
    {
        $guest = $this->client();
        $me = $this->buyer(User::factory()->create(['email' => 'me@example.com']));
        $owner = $this->owner();

        $this->grow(2, $me);
        $small = $this->measure($guest, $me, $owner);
        $this->grow(6, $me);
        $large = $this->measure($guest, $me, $owner);

        $grew = array_filter(array_map(fn ($uri) => $large[$uri] > $small[$uri] ? "{$uri}: {$small[$uri]} → {$large[$uri]}" : null, array_keys($small)));
        $this->assertSame([], array_values($grew), 'queries that grow with the data');
        foreach ($large as $uri => $n) {
            $this->assertLessThanOrEqual(25, $n, "{$uri} runs {$n} queries");
        }
    }
}
