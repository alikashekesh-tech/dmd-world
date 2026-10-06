<?php

namespace Tests\Feature\Promotions;

use App\Models\Category;
use App\Models\Offer;
use App\Models\Product;
use App\Services\Pricing;
use App\Services\ProductQuery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/** Store-wide offers: prices are computed from them everywhere, and products are never edited. */
class OfferTest extends TestCase
{
    use RefreshDatabase;

    private function offer(SpaClient $owner, array $over = [])
    {
        return $owner->post('/api/v1/admin/offers', ['name' => 'Back to school', 'label' => 'School sale', 'discount_type' => 'percent', 'discount_value' => 20,
            'product_ids' => [], 'category_ids' => [], ...$over]);
    }

    private function inCatalog(Product $p): array
    {
        return collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id);
    }

    public function test_an_offer_on_a_category_prices_everything_below_it_without_touching_products(): void
    {
        $games = Category::factory()->create(['name' => 'Games']);
        $ps5 = Category::factory()->create(['name' => 'PS5', 'parent_id' => $games->id]);
        $inside = Product::factory()->create(['regular_price' => '40.00']);
        $inside->categories()->attach($ps5->id, ['is_primary' => true]);
        $outside = Product::factory()->create(['regular_price' => '40.00']);
        $owner = $this->owner();

        $id = $this->offer($owner, ['category_ids' => [$games->id]])->assertCreated()
            ->assertJsonPath('data.state', 'running')->assertJsonPath('data.products_covered', 1)->json('data.id');

        $row = $this->inCatalog($inside);
        $this->assertEquals([32, 40, true, 20], [$row['price'], $row['regular_price'], $row['on_sale'], $row['discount_percent']]);
        $this->assertSame(['id' => $id, 'label' => 'School sale'], $row['offer']);
        $this->assertEquals(40, $this->inCatalog($outside)['price']);
        $this->assertSame(['40.00', null], [$inside->fresh()->regular_price, $inside->fresh()->sale_price], 'the product itself is never edited');

        // The same price in SQL (sorting and filtering) and in the cart.
        $this->assertSame([$inside->id], array_column($this->client()->get('/api/v1/products?max_price=35')->json('data'), 'id'));
        $this->assertSame($inside->id, $this->client()->get('/api/v1/products?sort=price_asc')->json('data.0.id'));
        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $inside->id, 'quantity' => 2]]])->assertJsonPath('data.total', 64);

        // Switched off, then deleted: prices are back, and there was nothing to restore.
        $owner->put("/api/v1/admin/offers/{$id}/active", ['is_active' => false])->assertOk()->assertJsonPath('data.state', 'off');
        $this->assertEquals(40, $this->inCatalog($inside)['price']);
        $owner->put("/api/v1/admin/offers/{$id}/active", ['is_active' => true])->assertOk();
        $owner->delete("/api/v1/admin/offers/{$id}")->assertNoContent();
        $this->assertEquals([40, false, null], [$this->inCatalog($inside)['price'], $this->inCatalog($inside)['on_sale'], $this->inCatalog($inside)['offer']]);
    }

    public function test_the_lowest_price_wins_and_an_offer_never_raises_a_price_or_makes_it_free(): void
    {
        $owner = $this->owner();
        $deepSale = Product::factory()->onSale('20.00')->create(['regular_price' => '40.00']);
        $smallSale = Product::factory()->onSale('38.00')->create(['regular_price' => '40.00']);
        $cheap = Product::factory()->create(['regular_price' => '4.00']);
        $this->offer($owner, ['product_ids' => [$deepSale->id, $smallSale->id]])->assertCreated();
        $this->offer($owner, ['name' => 'Five off', 'discount_type' => 'fixed', 'discount_value' => 5, 'product_ids' => [$cheap->id, $smallSale->id]])->assertCreated();

        $this->assertEquals(20, $this->inCatalog($deepSale)['price'], 'its own sale is deeper than 20% off');
        $this->assertNull($this->inCatalog($deepSale)['offer']);
        $this->assertEquals(32, $this->inCatalog($smallSale)['price'], '20% off beats both its sale and $5 off');
        $this->assertEquals(4, $this->inCatalog($cheap)['price'], '$5 off a $4 product doesn’t apply');
    }

    public function test_dates_decide_when_an_offer_runs(): void
    {
        $p = Product::factory()->create(['regular_price' => '50.00']);
        $owner = $this->owner();
        $this->offer($owner, ['product_ids' => [$p->id], 'starts_at' => now()->addDay()->toIso8601String(), 'ends_at' => now()->addDays(3)->toIso8601String()])
            ->assertCreated()->assertJsonPath('data.state', 'scheduled');
        $this->assertEquals(50, $this->inCatalog($p)['price']);

        $this->travel(2)->days();
        $this->assertEquals(40, $this->inCatalog($p)['price']);
        $this->assertNotNull($this->inCatalog($p)['sale_ends_at']);
        $this->travel(2)->days();
        $this->assertEquals(50, $this->inCatalog($p)['price']);
    }

    public function test_moving_a_category_under_an_offer_brings_its_products_in(): void
    {
        $sale = Category::factory()->create();
        $other = Category::factory()->create();
        $p = Product::factory()->create(['regular_price' => '10.00']);
        $p->categories()->attach($other->id, ['is_primary' => true]);
        $this->offer($this->owner(), ['category_ids' => [$sale->id]])->assertCreated();
        $this->assertEquals(10, $this->inCatalog($p)['price']);

        $other->update(['parent_id' => $sale->id]);
        $this->assertEquals(8, $this->inCatalog($p)['price']);
        $this->assertEquals(8, (float) DB::table('products')->selectRaw('('.ProductQuery::priceExpression()[0].') AS p', ProductQuery::priceExpression()[1])->where('id', $p->id)->value('p'));
    }

    public function test_php_and_sql_prices_agree_to_the_cent(): void
    {
        $owner = $this->owner();
        $products = collect(['19.99', '0.99', '7.45', '123.45', '3.33', '1000.01'])->map(fn ($price) => Product::factory()->create(['regular_price' => $price]));
        foreach ([['percent', 12.5], ['percent', 33.33], ['fixed', 0.99]] as $i => [$type, $value]) {
            $this->offer($owner, ['name' => "Offer {$i}", 'discount_type' => $type, 'discount_value' => $value, 'product_ids' => $products->pluck('id')->all()])->assertCreated();
        }
        [$sql, $bindings] = ProductQuery::priceExpression();
        $fromSql = DB::table('products')->selectRaw("id, ({$sql}) AS price", $bindings)->pluck('price', 'id');
        foreach ($products as $p) {
            $this->assertSame(Pricing::forProduct($p->fresh())['price'], (int) round((float) $fromSql[$p->id] * 100), "product at {$p->regular_price}");
        }
    }

    public function test_an_order_is_charged_the_offer_price_and_keeps_it_after_the_offer_ends(): void
    {
        Notification::fake();
        $p = Product::factory()->create(['regular_price' => '25.00']);
        $owner = $this->owner();
        $id = $this->offer($owner, ['product_ids' => [$p->id]])->json('data.id');

        $order = $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated();
        $order->assertJsonPath('data.total', 20)->assertJsonPath('data.items.0.unit_price', 20)->assertJsonPath('data.items.0.regular_price', 25);

        $owner->delete("/api/v1/admin/offers/{$id}")->assertNoContent();
        $this->assertSame('20.00', DB::table('order_items')->where('order_id', $order->json('data.id'))->value('unit_price'));
    }

    public function test_offers_are_validated_and_owner_only(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create();
        $this->offer($owner, ['discount_value' => 100, 'product_ids' => [$p->id]])->assertStatus(422);
        $this->offer($owner, ['discount_value' => 0, 'product_ids' => [$p->id]])->assertStatus(422);
        $this->offer($owner, ['discount_type' => 'bogo', 'product_ids' => [$p->id]])->assertStatus(422);
        $this->offer($owner)->assertStatus(422)->assertJsonPath('error.code', 'NO_TARGETS');
        $this->offer($owner, ['product_ids' => [987654321]])->assertStatus(422)->assertJsonPath('error.code', 'UNKNOWN_PRODUCT');
        $this->offer($owner, ['product_ids' => [$p->id], 'starts_at' => '2026-12-10', 'ends_at' => '2026-12-01'])->assertStatus(422);
        $this->assertSame(0, Offer::count());

        $this->offer($this->buyer(), ['product_ids' => [$p->id]])->assertUnauthorized();
        $this->client()->get('/api/v1/admin/offers')->assertUnauthorized();
    }
}
