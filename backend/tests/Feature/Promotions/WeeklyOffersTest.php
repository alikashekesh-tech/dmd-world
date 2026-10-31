<?php

namespace Tests\Feature\Promotions;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Weekly Offers on the home page are the store's offers (Admin › Offers): the catalog says which products are in a
 * running offer, at what price and until when, and follows an offer's start and end to the second.
 */
class WeeklyOffersTest extends TestCase
{
    use RefreshDatabase;

    private function offer(SpaClient $owner, array $over = [])
    {
        return $owner->post('/api/v1/admin/offers', ['name' => 'Weekly offers', 'label' => 'This week', 'discount_type' => 'percent', 'discount_value' => 25,
            'product_ids' => [], 'category_ids' => [], ...$over]);
    }

    private function inCatalog(Product $p): array
    {
        return collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id);
    }

    public function test_a_running_offer_marks_its_products_with_the_offer_its_price_and_its_end(): void
    {
        $owner = $this->owner();
        [$in, $out] = Product::factory()->count(2)->create(['regular_price' => '80.00']);
        $this->offer($owner, ['product_ids' => [$in->id], 'ends_at' => now()->addDays(5)->toIso8601String()])->assertCreated();

        $p = $this->inCatalog($in);
        $this->assertSame([60, 80, true, 25, 'This week'], [$p['price'], $p['regular_price'], $p['on_sale'], $p['discount_percent'], $p['offer']['label']]);
        $this->assertNotNull($p['sale_ends_at']);
        $this->assertNull($this->inCatalog($out)['offer'], 'a product outside the offer is not on it');
    }

    public function test_a_scheduled_offer_starts_and_ends_on_time_even_with_the_catalog_cached(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['regular_price' => '40.00']);
        $this->offer($owner, ['product_ids' => [$p->id], 'starts_at' => now()->addSeconds(30)->toIso8601String(), 'ends_at' => now()->addSeconds(90)->toIso8601String()])
            ->assertCreated()->assertJsonPath('data.state', 'scheduled');

        $this->assertEquals(40, $this->inCatalog($p)['price']); // caches the catalog (normally for a minute)
        $this->travel(31)->seconds();
        $this->assertEquals(30, $this->inCatalog($p)['price'], 'the offer starts on time, not up to a minute late');
        $this->travel(60)->seconds();
        $this->assertEquals(40, $this->inCatalog($p)['price'], 'and ends on time');
    }

    public function test_switching_an_offer_off_takes_its_products_off_offer_at_once(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['regular_price' => '20.00']);
        $id = $this->offer($owner, ['product_ids' => [$p->id]])->assertCreated()->json('data.id');
        $this->assertNotNull($this->inCatalog($p)['offer']);

        $owner->put("/api/v1/admin/offers/{$id}/active", ['is_active' => false])->assertOk();
        $this->assertSame([20, null], [$this->inCatalog($p)['price'], $this->inCatalog($p)['offer']]);
    }
}
