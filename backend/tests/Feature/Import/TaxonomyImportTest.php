<?php

namespace Tests\Feature\Import;

use App\Models\Brand;
use App\Models\Category;
use App\Services\CategoryTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** The old store's categories (fixture: the WooCommerce category list) imported with the storefront's layout. */
class TaxonomyImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dmd.import.woocommerce' => ['url' => 'https://old-store.test', 'key' => 'ck_test', 'secret' => 'cs_test']]);
    }

    private function import(): void
    {
        $categories = json_decode(file_get_contents(base_path('tests/Fixtures/woocommerce/categories.json')), true);
        Http::fake([
            'old-store.test/wp-json/wc/v3/products/categories*' => Http::response($categories, 200, ['X-WP-TotalPages' => '1']),
        ]);
        $this->artisan('dmd:import', ['--only' => ['taxonomy']])->assertSuccessful();
    }

    public function test_the_storefront_taxonomy_is_rebuilt_in_mysql_with_legacy_ids(): void
    {
        $this->import();

        // Brands are first-class now (same ids as their old categories), with their product lines.
        $razer = Brand::find(904);
        $this->assertSame(['Razer', 'razer'], [$razer->name, $razer->slug]);
        $this->assertSame(10, Brand::count());
        $mouse = Category::find(382);
        $this->assertSame([904, null, 'Mouse'], [$mouse->brand_id, $mouse->parent_id, $mouse->name]);
        $this->assertNull(Category::find(904), 'a brand is not also a category');

        // The storefront's tree, not WooCommerce's: PS5 games sit under PS5.
        $this->assertSame(300, Category::find(338)->parent_id);
        $tree = CategoryTree::load();
        $this->assertSame(339, $tree->resolve('playstation/ps5/games/used')?->id);
        $this->assertSame(382, $tree->resolve('razer/mouse')?->id);
        $this->assertSame(996, $tree->resolve('new-offers')?->id);

        // Groupings that had no WooCommerce category get new ids above the legacy range.
        $other = $tree->resolve('other');
        $this->assertNotNull($other);
        $this->assertGreaterThanOrEqual(100000, $other->id);
        $this->assertSame($other->id, Category::find(369)->parent_id, 'action figures sit under Other');
        $this->assertNotNull($tree->resolve('pc-parts/hard-disk-and-flash/flash-memory'));

        // Categories the old menu didn't list keep a place under their WooCommerce parent, with readable names.
        $this->assertSame(285, Category::find(319)->parent_id);
        $this->assertSame('Bluetooth Speaker', Category::find(319)->name);

        // Every WooCommerce category is accounted for: as a category or as a brand.
        $this->assertSame(112, Category::whereKey(collect(json_decode(file_get_contents(base_path('tests/Fixtures/woocommerce/categories.json')), true))->pluck('id'))->count() + Brand::count());
    }

    public function test_running_the_import_again_changes_nothing(): void
    {
        $this->import();
        $before = [Category::count(), Brand::count(), Category::orderBy('id')->pluck('slug', 'id')->all()];

        $this->import();

        $this->assertSame($before, [Category::count(), Brand::count(), Category::orderBy('id')->pluck('slug', 'id')->all()]);
    }

    public function test_the_storefront_api_serves_the_imported_taxonomy(): void
    {
        $this->import();

        $this->client()->get('/api/v1/categories/lookup?path=nintendo-switch/games/new')->assertOk()->assertJsonPath('data.id', 297);
        $this->client()->get('/api/v1/brands')->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('data.0.slug', 'marvo');
        $this->client()->get('/api/v1/brands/hyperx')->assertOk()->assertJsonFragment(['path' => 'hyperx/keyboards']);
    }

    public function test_the_import_refuses_to_run_in_production_without_force(): void
    {
        $this->app['env'] = 'production';
        $this->artisan('dmd:import', ['--only' => ['taxonomy']])->expectsOutputToContain('production')->assertFailed();
        $this->assertSame(0, Category::count());
    }

    public function test_a_failing_store_leaves_nothing_half_imported(): void
    {
        Http::fake(['*' => Http::response(['message' => 'nope'], 500)]);
        $this->artisan('dmd:import', ['--only' => ['taxonomy']])->expectsOutputToContain('Import stopped')->assertFailed();
        $this->assertSame(0, Category::count() + Brand::count());
    }
}
