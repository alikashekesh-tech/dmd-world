<?php

namespace Tests\Feature\Import;

use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** The old store's products (fixture: the emulator's 187 products, from the live store's snapshot). */
class ProductImportTest extends TestCase
{
    use RefreshDatabase;

    private array $products;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dmd.import.woocommerce' => ['url' => 'https://old-store.test', 'key' => 'ck_test', 'secret' => 'cs_test']]);
        $this->products = json_decode(file_get_contents(base_path('tests/Fixtures/woocommerce/products.json')), true);
    }

    private function import(?array $products = null): void
    {
        $categories = json_decode(file_get_contents(base_path('tests/Fixtures/woocommerce/categories.json')), true);
        Http::swap(new Factory(app('events'))); // a fresh fake for each import (the first matching fake would win)
        Http::fake([
            'old-store.test/wp-json/wc/v3/products/categories*' => Http::response($categories, 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/products*' => Http::response($products ?? $this->products, 200, ['X-WP-TotalPages' => '1']),
        ]);
        $this->artisan('dmd:import', ['--only' => ['taxonomy', 'products']])->assertSuccessful();
    }

    private function fixture(callable $where): array
    {
        return collect($this->products)->first($where);
    }

    public function test_products_arrive_with_their_ids_prices_stock_categories_and_brand(): void
    {
        $this->import();

        $this->assertSame(187, Product::count());
        $fc = Product::find(34198);
        $this->assertSame(['PS4 FC 2026 ARABIC', '32.00', '28.00', 15, 'DMD-34198'], [$fc->name, $fc->regular_price, $fc->sale_price, $fc->stock_quantity, $fc->sku]);
        $this->assertSame(291, $fc->categories()->wherePivot('is_primary', true)->value('categories.id'), 'the deepest category, not New Offers');
        $this->assertTrue($fc->categories()->where('categories.id', 996)->exists(), 'still on the New Offers row');

        $razerProduct = $this->fixture(fn ($p) => collect($p['categories'])->contains('id', 904));
        $this->assertSame(904, Product::find($razerProduct['id'])->brand_id);
        $this->assertFalse(Product::find($razerProduct['id'])->categories()->where('categories.id', 904)->exists());

        $soldOut = $this->fixture(fn ($p) => $p['stock_status'] === 'outofstock');
        $this->client()->get("/api/v1/products/{$soldOut['id']}")->assertOk()->assertJsonPath('data.availability', 'out_of_stock');
        $this->assertSame(187, ProductImage::count());
        $this->assertSame(Product::where('stock_quantity', '>', 0)->count(), InventoryMovement::where('reason', 'import')->count());
        $this->assertCount(187, $this->client()->get('/api/v1/catalog')->json('products'));
    }

    public function test_importing_again_updates_instead_of_duplicating(): void
    {
        $this->import();
        $this->import();
        $this->assertSame([187, 187], [Product::count(), ProductImage::count()]);
        $movements = InventoryMovement::count();

        // The store changed a price and a stock level since: the same rows follow.
        $changed = array_map(fn ($p) => $p['id'] === 34198 ? ['stock_quantity' => 9, 'regular_price' => '35', 'sale_price' => ''] + $p : $p, $this->products);
        $this->import($changed);

        $p = Product::find(34198);
        $this->assertSame(['35.00', null, 9], [$p->regular_price, $p->sale_price, $p->stock_quantity]);
        $this->assertSame($movements + 1, InventoryMovement::count(), 'one movement for the difference');
        $this->assertSame(-6, InventoryMovement::latest('id')->first()->quantity_change);
    }

    public function test_products_that_cannot_be_sold_are_reported_not_half_imported(): void
    {
        $odd = [['id' => 777, 'name' => 'Bundle', 'type' => 'variable', 'regular_price' => '10'] + $this->products[0], ['id' => 778, 'name' => 'No price', 'regular_price' => '', 'price' => ''] + $this->products[1]];
        $this->import($odd);

        $this->assertNull(Product::find(777));
        $this->assertNull(Product::find(778));
    }
}
