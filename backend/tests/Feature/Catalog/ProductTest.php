<?php

namespace Tests\Feature\Catalog;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '/api/v1/admin/products';

    private function form(array $over = []): array
    {
        return ['name' => 'DualSense Edge', 'regular_price' => 199.99, 'status' => 'published', 'stock_quantity' => 7, ...$over];
    }

    public function test_a_product_the_owner_adds_appears_everywhere_on_the_storefront(): void
    {
        $owner = $this->owner();
        $brand = Brand::factory()->create(['slug' => 'sony']);
        $ps = Category::factory()->create(['slug' => 'playstation']);
        $acc = Category::factory()->create(['slug' => 'accessories', 'parent_id' => $ps->id]);

        $id = $owner->post(self::ADMIN, $this->form([
            'brand_id' => $brand->id, 'category_ids' => [$acc->id], 'sku' => 'CFI-ZCP1',
            'short_description' => 'Pro controller', 'description' => "Swappable sticks.\n\nBack buttons.",
            'images' => [['url' => 'https://cdn.example.com/edge.png', 'alt' => 'DualSense Edge'], ['url' => '/storage/uploads/2026/10/x.png']],
            'specifications' => [['name' => 'Connectivity', 'value' => 'USB-C, Bluetooth'], ['name' => 'Weight', 'value' => '325 g']],
        ]))->assertCreated()->assertJsonPath('data.slug', 'dualsense-edge')->assertJsonPath('data.availability', 'in_stock')->json('data.id');
        $this->assertGreaterThanOrEqual(1000000, $id, 'new products live above the imported id range');

        $this->client()->get("/api/v1/products/{$id}")->assertOk()
            ->assertJsonPath('data.price', 199.99)
            ->assertJsonPath('data.brand.slug', 'sony')
            ->assertJsonPath('data.image', 'https://cdn.example.com/edge.png')
            ->assertJsonPath('data.specifications.0', ['name' => 'Connectivity', 'value' => 'USB-C, Bluetooth'])
            ->assertJsonPath('data.primary_category_id', $acc->id)
            ->assertJsonPath('data.stock_left', null);

        $this->assertContains($id, array_column($this->client()->get("/api/v1/products?category={$ps->id}")->json('data'), 'id'), 'listed under the parent category too');
        $this->assertContains($id, array_column($this->client()->get('/api/v1/products?category_path=playstation/accessories')->json('data'), 'id'));
        $this->assertContains($id, array_column($this->client()->get('/api/v1/products?brand=sony')->json('data'), 'id'));
        $this->assertContains($id, array_column($this->client()->get('/api/v1/products?q=edge')->json('data'), 'id'));
        $this->assertContains($id, array_column($this->client()->get('/api/v1/products?q=CFI-ZCP1')->json('data'), 'id'));
        $this->assertContains($id, array_column($this->client()->get('/api/v1/catalog')->json('products'), 'id'));
    }

    public function test_an_admin_change_shows_up_at_once_in_every_storefront_view(): void
    {
        $owner = $this->owner();
        $cat = Category::factory()->create();
        $product = Product::factory()->create(['regular_price' => '50.00']);
        $product->categories()->attach($cat->id, ['is_primary' => true]);
        $first = $this->client()->get('/api/v1/catalog')->assertOk();
        $etag = $first->headers->get('ETag');
        $this->client()->get('/api/v1/catalog', ['If-None-Match' => $etag])->assertStatus(304);

        $owner->put(self::ADMIN."/{$product->id}", ['name' => 'Renamed', 'regular_price' => 40, 'sale_price' => 35])->assertOk();

        $this->client()->get("/api/v1/products/{$product->id}")->assertJsonPath('data.name', 'Renamed')->assertJsonPath('data.price', 35)->assertJsonPath('data.on_sale', true);
        $listed = collect($this->client()->get("/api/v1/products?category={$cat->id}")->json('data'))->firstWhere('id', $product->id);
        $this->assertSame([35, 40, 'Renamed'], [$listed['price'], $listed['regular_price'], $listed['name']]);
        $catalog = $this->client()->get('/api/v1/catalog', ['If-None-Match' => $etag])->assertOk();
        $this->assertNotSame($etag, $catalog->headers->get('ETag'));
        $this->assertSame(35, collect($catalog->json('products'))->firstWhere('id', $product->id)['price']);
    }

    public function test_drafts_and_archived_products_stay_off_the_storefront(): void
    {
        $owner = $this->owner();
        $id = $owner->post(self::ADMIN, $this->form(['status' => 'draft']))->assertCreated()->assertJsonPath('data.on_storefront', false)->json('data.id');
        $this->client()->get("/api/v1/products/{$id}")->assertNotFound();
        $this->assertNotContains($id, array_column($this->client()->get('/api/v1/catalog')->json('products'), 'id'));

        $owner->put(self::ADMIN."/{$id}", ['status' => 'published'])->assertOk()->assertJsonPath('data.on_storefront', true);
        $this->client()->get("/api/v1/products/{$id}")->assertOk();

        $owner->delete(self::ADMIN."/{$id}")->assertNoContent();
        $this->client()->get("/api/v1/products/{$id}")->assertNotFound();
        $owner->get(self::ADMIN.'?archived=only')->assertJsonFragment(['id' => $id]);
        $owner->post(self::ADMIN."/{$id}/restore")->assertOk();
        $this->client()->get("/api/v1/products/{$id}")->assertOk();

        $owner->delete(self::ADMIN."/{$id}/permanent")->assertStatus(409)->assertJsonPath('error.code', 'NOT_ARCHIVED');
        $owner->delete(self::ADMIN."/{$id}")->assertNoContent();
        $owner->delete(self::ADMIN."/{$id}/permanent")->assertNoContent();
        $this->assertNull(Product::withTrashed()->find($id));
    }

    public function test_prices_are_validated_on_the_server(): void
    {
        $owner = $this->owner();
        $owner->post(self::ADMIN, $this->form(['regular_price' => 0]))->assertStatus(422)->assertJsonPath('error.fields.regular_price.0', 'The price must be more than $0.');
        $owner->post(self::ADMIN, $this->form(['regular_price' => -5]))->assertStatus(422);
        $owner->post(self::ADMIN, $this->form(['regular_price' => 10.999]))->assertStatus(422)->assertJsonPath('error.fields.regular_price.0', 'Use at most two decimals (cents).');
        $owner->post(self::ADMIN, $this->form(['regular_price' => 20, 'sale_price' => 20]))->assertStatus(422)->assertJsonPath('error.code', 'SALE_NOT_LOWER');
        $owner->post(self::ADMIN, $this->form(['sale_price' => 10, 'sale_starts_at' => '2026-12-10', 'sale_ends_at' => '2026-12-01']))->assertStatus(422)->assertJsonPath('error.code', 'SALE_DATES');

        $id = $owner->post(self::ADMIN, $this->form(['regular_price' => 100, 'sale_price' => 80]))->assertCreated()->json('data.id');
        // Lowering the price below the existing sale price would make the "sale" a markup.
        $owner->put(self::ADMIN."/{$id}", ['regular_price' => 70])->assertStatus(422)->assertJsonPath('error.code', 'SALE_NOT_LOWER');
        $this->assertSame('100.00', Product::find($id)->regular_price);
    }

    public function test_skus_and_slugs_are_unique(): void
    {
        $owner = $this->owner();
        $owner->post(self::ADMIN, $this->form(['sku' => 'DMD-1']))->assertCreated();
        $owner->post(self::ADMIN, $this->form(['sku' => 'dmd-1']))->assertStatus(422)->assertJsonPath('error.code', 'SKU_TAKEN');
        $owner->post(self::ADMIN, $this->form())->assertCreated()->assertJsonPath('data.slug', 'dualsense-edge-2');
        $owner->post(self::ADMIN, $this->form(['slug' => 'dualsense-edge']))->assertStatus(422)->assertJsonPath('error.code', 'SLUG_TAKEN');

        $archived = Product::factory()->create(['sku' => 'OLD-1']);
        $archived->delete();
        $owner->post(self::ADMIN, $this->form(['sku' => 'OLD-1']))->assertStatus(422)->assertJsonPath('error.code', 'SKU_TAKEN');
    }

    public function test_the_main_category_must_be_one_of_the_products_categories(): void
    {
        $owner = $this->owner();
        [$a, $b, $c] = Category::factory()->count(3)->create()->pluck('id')->all();
        $owner->post(self::ADMIN, $this->form(['category_ids' => [$a, $b], 'primary_category_id' => $c]))->assertStatus(422)->assertJsonPath('error.code', 'PRIMARY_NOT_LISTED');
        $id = $owner->post(self::ADMIN, $this->form(['category_ids' => [$a, $b], 'primary_category_id' => $b]))->assertCreated()->json('data.id');
        $this->client()->get("/api/v1/products/{$id}")->assertJsonPath('data.primary_category_id', $b);
        $owner->post(self::ADMIN, $this->form(['category_ids' => [999999]]))->assertStatus(422);
    }

    public function test_storefront_filters_and_sorting(): void
    {
        $cheap = Product::factory()->create(['name' => 'Cable', 'regular_price' => '5.00']);
        $mid = Product::factory()->create(['name' => 'Mouse', 'regular_price' => '30.00', 'sale_price' => '20.00']);
        $dear = Product::factory()->create(['name' => 'Monitor', 'regular_price' => '300.00', 'stock_quantity' => 0]);

        $ids = fn (string $query) => array_column($this->client()->get('/api/v1/products?'.$query)->json('data'), 'id');
        $this->assertSame([$cheap->id, $mid->id, $dear->id], $ids('sort=price_asc'));
        $this->assertSame([$mid->id], $ids('min_price=10&max_price=25'));
        $this->assertSame([$mid->id], $ids('on_sale=1'));
        $this->assertNotContains($dear->id, $ids('in_stock=1'));
        $this->assertSame([$dear->id], $ids("ids={$dear->id}"));
        $this->client()->get('/api/v1/products?sort=hacked')->assertStatus(422);
        $this->client()->get('/api/v1/products?category=999999')->assertNotFound();
    }

    public function test_bulk_actions(): void
    {
        $owner = $this->owner();
        $drafts = Product::factory()->count(3)->draft()->create();
        $owner->post(self::ADMIN.'/bulk', ['action' => 'publish', 'ids' => $drafts->pluck('id')->all()])->assertOk()->assertJson(['count' => 3]);
        $this->assertSame(3, Product::published()->count());
        $owner->post(self::ADMIN.'/bulk', ['action' => 'feature', 'ids' => [$drafts[0]->id]])->assertOk();
        $this->assertTrue($drafts[0]->fresh()->is_featured);
        $owner->post(self::ADMIN.'/bulk', ['action' => 'archive', 'ids' => $drafts->pluck('id')->all()])->assertOk();
        $this->assertSame(0, Product::count());
        $owner->post(self::ADMIN.'/bulk', ['action' => 'explode', 'ids' => [1]])->assertStatus(422);
    }

    public function test_only_the_owner_can_manage_products(): void
    {
        $product = Product::factory()->create();
        foreach ([$this->client(), $this->buyer()] as $browser) {
            $browser->get(self::ADMIN)->assertUnauthorized();
            $browser->post(self::ADMIN, $this->form())->assertUnauthorized();
            $browser->put(self::ADMIN."/{$product->id}", ['regular_price' => 1])->assertUnauthorized();
            $browser->delete(self::ADMIN."/{$product->id}")->assertUnauthorized();
            $browser->post(self::ADMIN.'/bulk', ['action' => 'archive', 'ids' => [$product->id]])->assertUnauthorized();
            $browser->put("/api/v1/admin/inventory/{$product->id}", ['stock_quantity' => 0])->assertUnauthorized();
        }
        $this->assertSame('25.00', $product->fresh()->regular_price);
        $this->assertSame(10, $product->fresh()->stock_quantity);
    }
}
