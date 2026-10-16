<?php

namespace Tests\Feature\Promotions;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Offer;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * What an offer covers (products, brands, categories, any mix, or the entire store), the counts the admin shows, the
 * live preview, and that every surface (catalog, product page, sorting, cart, checkout, variants) charges the same price.
 */
class OfferTargetingTest extends TestCase
{
    use RefreshDatabase;

    private function offer(SpaClient $owner, array $over = [])
    {
        return $owner->post('/api/v1/admin/offers', ['name' => 'Autumn', 'discount_type' => 'percent', 'discount_value' => 20, ...$over]);
    }

    private function price(Product $p): float|int|string
    {
        return collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id)['price'] ?? 'hidden';
    }

    private function product(array $attrs = [], ?Category $in = null): Product
    {
        $p = Product::factory()->create(['regular_price' => '50.00', ...$attrs]);
        if ($in) {
            $p->categories()->attach($in->id, ['is_primary' => true]);
        }

        return $p;
    }

    public function test_a_brand_covers_all_its_products_whatever_their_category_and_follows_brand_changes(): void
    {
        $owner = $this->owner();
        [$fantech, $hyperx] = [Brand::factory()->create(['name' => 'Fantech']), Brand::factory()->create(['name' => 'HyperX'])];
        $headsets = Category::factory()->create(['name' => 'Headsets']);
        $line = Category::factory()->create(['name' => 'Headphones', 'brand_id' => $fantech->id]);
        $inLine = $this->product(['brand_id' => $fantech->id], $line);
        $elsewhere = $this->product(['brand_id' => $fantech->id], $headsets);
        $other = $this->product(['brand_id' => $hyperx->id], $headsets);
        $noBrand = $this->product([], $headsets);

        $this->offer($owner, ['brand_ids' => [$fantech->id]])->assertCreated()
            ->assertJsonPath('data.brand_ids', [$fantech->id])->assertJsonPath('data.products_covered', 2)
            ->assertJsonPath('data.targets.brands.0.name', 'Fantech')->assertJsonPath('data.targets.brands.0.products', 2);
        $this->assertEquals([40, 40, 50, 50], [$this->price($inLine), $this->price($elsewhere), $this->price($other), $this->price($noBrand)]);

        // Moving a product to another brand moves it in or out of the offer.
        $other->forceFill(['brand_id' => $fantech->id])->save();
        $elsewhere->forceFill(['brand_id' => null])->save();
        $this->assertEquals([40, 50], [$this->price($other), $this->price($elsewhere)]);
    }

    public function test_products_brands_and_categories_mix_and_a_product_covered_twice_is_discounted_once(): void
    {
        $owner = $this->owner();
        $brand = Brand::factory()->create();
        $audio = Category::factory()->create();
        $mics = Category::factory()->create(['parent_id' => $audio->id]);
        $a = $this->product(['brand_id' => $brand->id], $mics); // brand + category + picked: three ways
        $b = $this->product([], $mics);                        // category only (through the parent)
        $c = $this->product();                                 // picked only
        $d = $this->product();                                 // not covered

        $r = $this->offer($owner, ['product_ids' => [$a->id, $c->id], 'brand_ids' => [$brand->id], 'category_ids' => [$audio->id]])->assertCreated()->json('data');
        $this->assertSame(3, $r['products_covered']);
        $this->assertEquals([40, 40, 40, 50], [$this->price($a), $this->price($b), $this->price($c), $this->price($d)], '20% once, never 20% three times');
        $this->assertSame(1, $r['targets']['categories'][0]['subcategories']);
        $this->assertSame(2, $r['targets']['categories'][0]['products']);

        // Saved and restored as picked.
        $edit = $owner->get("/api/v1/admin/offers/{$r['id']}")->assertOk()->json('data');
        $this->assertSame([[$a->id, $c->id], [$brand->id], [$audio->id], false], [$edit['product_ids'], $edit['brand_ids'], $edit['category_ids'], $edit['entire_store']]);

        // A category moved under the picked one comes in.
        $d->categories()->attach(Category::factory()->create(['parent_id' => $mics->id])->id, ['is_primary' => true]);
        $this->assertEquals(40, $this->price($d->fresh()));
    }

    public function test_entire_store_covers_every_published_product_and_counts_only_what_buyers_can_see(): void
    {
        $owner = $this->owner();
        $live = $this->product();
        $this->product(['status' => 'draft', 'published_at' => null]);
        $this->product()->delete();
        $later = null;

        $r = $this->offer($owner, ['entire_store' => true, 'discount_value' => 10])->assertCreated()->assertJsonPath('data.entire_store', true)->assertJsonPath('data.products_covered', 1)->json('data');
        $this->assertEquals(45, $this->price($live));
        $later = $this->product(['regular_price' => '80.00']);
        $this->assertEquals(72, $this->price($later), 'products published later are included');
        $this->assertSame(2, $owner->get('/api/v1/admin/offers')->json('data.0.products_covered'));

        $owner->post('/api/v1/admin/offers', ['name' => 'Nothing', 'discount_type' => 'percent', 'discount_value' => 10])->assertStatus(422)->assertJsonPath('error.code', 'NO_TARGETS');
        $this->assertSame(1, Offer::count());
        $this->assertNotNull($r);
    }

    public function test_counts_leave_out_drafts_deleted_products_and_deleted_products_never_block_editing(): void
    {
        $owner = $this->owner();
        $cat = Category::factory()->create();
        $ok = $this->product([], $cat);
        $draft = $this->product(['status' => 'draft', 'published_at' => null], $cat);
        $trashed = $this->product([], $cat);
        $trashed->delete();
        $gone = $this->product();

        // Covered and in the shop: $ok and $gone (still published); the draft and the trashed product are left out.
        $id = $this->offer($owner, ['category_ids' => [$cat->id], 'product_ids' => [$gone->id, $draft->id]])->assertCreated()->assertJsonPath('data.products_covered', 2)->json('data.id');
        $gone->forceDelete();

        $show = $owner->get("/api/v1/admin/offers/{$id}")->assertOk()->json('data');
        $this->assertSame(1, $show['products_covered']);
        $this->assertSame([['id' => $gone->id, 'status' => 'missing', 'name' => null], 'draft'], [$show['targets']['products'][0], $show['targets']['products'][1]['status']]);

        // Changing the name and dates still saves; the deleted pick is kept (and covers nothing) until the owner removes it.
        $owner->put("/api/v1/admin/offers/{$id}", ['name' => 'Renamed', 'discount_type' => 'percent', 'discount_value' => 25, 'category_ids' => [$cat->id], 'product_ids' => [$gone->id, $draft->id],
            'ends_at' => now()->addWeek()->toIso8601String()])->assertOk()->assertJsonPath('data.name', 'Renamed')->assertJsonPath('data.product_ids', [$gone->id, $draft->id]);
        $this->assertEquals(37.5, $this->price($ok));
        // A new pick that doesn't exist is refused, with the reason.
        $owner->put("/api/v1/admin/offers/{$id}", ['name' => 'Renamed', 'discount_type' => 'percent', 'discount_value' => 25, 'product_ids' => [987654]])
            ->assertStatus(422)->assertJsonPath('error.code', 'UNKNOWN_PRODUCT');
        $owner->post('/api/v1/admin/offers', ['name' => 'Brandless', 'discount_type' => 'percent', 'discount_value' => 5, 'brand_ids' => [987654]])->assertStatus(422)->assertJsonPath('error.code', 'UNKNOWN_BRAND');
    }

    public function test_more_than_forty_picked_products_come_back_with_their_names_in_one_request(): void
    {
        $owner = $this->owner();
        $ids = Product::factory()->count(45)->create()->pluck('id')->all();
        $id = $this->offer($owner, ['product_ids' => $ids])->assertCreated()->assertJsonPath('data.products_covered', 45)->json('data.id');
        $products = $owner->get("/api/v1/admin/offers/{$id}")->assertOk()->json('data.targets.products');
        $this->assertCount(45, $products);
        $this->assertSame($ids, array_column($products, 'id'));
        $this->assertNotContains(null, array_column($products, 'name'));
        $this->assertNotContains(null, array_column($products, 'sku'));
    }

    public function test_the_same_price_everywhere_catalog_product_page_sorting_cart_checkout_and_variants(): void
    {
        Notification::fake();
        $owner = $this->owner();
        $brand = Brand::factory()->create();
        $simple = $this->product(['brand_id' => $brand->id, 'regular_price' => '30.00']);
        $variable = $this->product(['brand_id' => $brand->id, 'type' => 'variable', 'regular_price' => '40.00', 'variation_attributes' => [['name' => 'Colour', 'values' => ['Black', 'Red']]]]);
        $variants = collect([['Black', '40.00', null], ['Red', '60.00', '45.00']])->map(fn ($v, $i) => tap((new ProductVariant)->forceFill([
            'product_id' => $variable->id, 'sku' => 'V-'.$v[0], 'options' => ['Colour' => $v[0]], 'options_key' => ProductVariant::key(['Colour' => $v[0]]),
            'regular_price' => $v[1], 'sale_price' => $v[2], 'track_stock' => true, 'stock_quantity' => 5, 'stock_status' => 'in_stock', 'is_active' => true, 'position' => $i,
        ]))->save());
        $this->offer($owner, ['brand_ids' => [$brand->id], 'discount_value' => 25])->assertCreated();

        $this->assertEquals(22.5, $this->price($simple));
        $page = $this->client()->get("/api/v1/products/{$variable->id}")->assertOk()->json('data');
        $this->assertEquals([30, 45], array_column($page['variants'], 'price'), 'Black: 25% off 40; Red: own sale 45 beats 25% off 60 (45 too): lowest, never both');
        $this->assertSame([$simple->id], array_column($this->client()->get('/api/v1/products?max_price=25')->json('data'), 'id'), 'SQL sorting/filtering uses the same price');
        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $simple->id, 'quantity' => 2], ['product_id' => $variable->id, 'variant_id' => $variants[0]->id, 'quantity' => 1]]])
            ->assertOk()->assertJsonPath('data.total', 75);
        $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $simple->id, 'quantity' => 1], ['product_id' => $variable->id, 'variant_id' => $variants[0]->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'], 'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->assertJsonPath('data.items.0.unit_price', 22.5)->assertJsonPath('data.items.1.unit_price', 30)->assertJsonPath('data.total', 52.5);
    }

    public function test_overlapping_offers_and_own_sales_give_the_lowest_price_never_a_sum(): void
    {
        $owner = $this->owner();
        $brand = Brand::factory()->create();
        $cat = Category::factory()->create();
        $p = $this->product(['brand_id' => $brand->id, 'regular_price' => '100.00'], $cat);
        $sale = $this->product(['brand_id' => $brand->id, 'regular_price' => '100.00', 'sale_price' => '60.00'], $cat);
        $brandOffer = $this->offer($owner, ['name' => 'Brand week', 'brand_ids' => [$brand->id], 'discount_value' => 10])->json('data.id');
        $this->offer($owner, ['name' => 'Category days', 'category_ids' => [$cat->id], 'discount_type' => 'fixed', 'discount_value' => 30]);
        $this->assertEquals([70, 60], [$this->price($p), $this->price($sale)], 'best of 10% and $30 off; the own sale is lower still');
        $owner->put("/api/v1/admin/offers/{$brandOffer}/active", ['is_active' => false])->assertOk();
        $owner->delete('/api/v1/admin/offers/'.Offer::where('name', 'Category days')->value('id'))->assertNoContent();
        $this->assertEquals([100, 60], [$this->price($p), $this->price($sale)]);
    }

    public function test_the_preview_counts_outcomes_left_out_products_and_overlaps_before_saving(): void
    {
        $this->travelTo(Carbon::parse('2026-10-16 09:00:00', 'UTC'));
        $owner = $this->owner();
        $brand = Brand::factory()->create();
        $drops = $this->product(['brand_id' => $brand->id, 'regular_price' => '100.00']);
        $ownSale = $this->product(['brand_id' => $brand->id, 'regular_price' => '100.00', 'sale_price' => '50.00']);
        $cheap = $this->product(['brand_id' => $brand->id, 'regular_price' => '8.00']);
        $this->product(['brand_id' => $brand->id, 'status' => 'draft', 'published_at' => null]);
        $this->product(['brand_id' => $brand->id])->delete();
        $other = $this->offer($owner, ['name' => 'Summer', 'product_ids' => [$drops->id], 'discount_value' => 5])->json('data.id');

        $pv = $owner->post('/api/v1/admin/offers/preview', ['name' => 'Autumn', 'discount_type' => 'fixed', 'discount_value' => 10, 'brand_ids' => [$brand->id], 'product_ids' => [999999]])
            ->assertOk()->json('data');
        $this->assertSame(3, $pv['eligible']);
        $this->assertSame(['decrease' => 1, 'already_cheaper' => 1, 'not_applicable' => 1], $pv['outcomes']);
        $this->assertSame(['drafts' => 1, 'trashed' => 1, 'missing_products' => 1], $pv['left_out']);
        $this->assertSame([$brand->id => 3], $pv['per_target']['brands']);
        $byId = collect($pv['sample'])->keyBy('id');
        $this->assertEquals([95, 90], [$byId[$drops->id]['current'], $byId[$drops->id]['with']], 'shown against the price it has now (Summer: 5% off)');
        $this->assertSame('Its own sale price is already lower.', $byId[$ownSale->id]['reason']);
        $this->assertSame('not_applicable', $byId[$cheap->id]['outcome']);
        $this->assertSame([['id' => $other, 'name' => 'Summer', 'shared' => 1]], array_map(fn ($o) => array_intersect_key($o, array_flip(['id', 'name', 'shared'])), $pv['overlaps']));

        // Editing an offer previews against the others, not against its own saved version.
        $self = $owner->post('/api/v1/admin/offers/preview', ['offer_id' => $other, 'discount_type' => 'percent', 'discount_value' => 5, 'product_ids' => [$drops->id]])->json('data');
        $this->assertSame([[], 1], [$self['overlaps'], $self['outcomes']['decrease']]);

        // A later start is priced at that moment: the own sale has ended by then.
        $ownSale->forceFill(['sale_ends_at' => '2026-10-20 00:00:00'])->save();
        $later = $owner->post('/api/v1/admin/offers/preview', ['discount_type' => 'fixed', 'discount_value' => 10, 'product_ids' => [$ownSale->id], 'starts_at' => '2026-10-25T00:00:00+03:00'])->json('data');
        $this->assertSame(['2026-10-24T21:00:00+00:00', 1], [$later['at'], $later['outcomes']['decrease']]);

        // No discount entered yet: counts only. Nothing is saved by previewing.
        $this->assertFalse($owner->post('/api/v1/admin/offers/preview', ['brand_ids' => [$brand->id]])->assertOk()->json('data.priced'));
        $this->assertSame(1, Offer::count());
        $this->buyer()->post('/api/v1/admin/offers/preview', ['brand_ids' => [$brand->id]])->assertUnauthorized();
    }
}
