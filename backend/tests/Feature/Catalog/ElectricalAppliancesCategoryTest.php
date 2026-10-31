<?php

namespace Tests\Feature\Catalog;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The migration that adds "Electrical Appliances": additive, once, and only on a store that has its catalog. */
class ElectricalAppliancesCategoryTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_31_001800_add_electrical_appliances_category.php');
    }

    private function theCategory()
    {
        return Category::withTrashed()->whereNull('parent_id')->whereNull('brand_id')->where('slug', 'electrical-appliances');
    }

    public function test_an_empty_database_is_left_alone(): void
    {
        $this->assertSame(0, Category::count()); // it already ran with the other migrations, before any import
        $this->migration()->up();
        $this->assertSame(0, Category::count());
    }

    public function test_a_store_with_its_catalog_gets_it_once_and_the_owner_manages_it(): void
    {
        $owner = $this->owner();
        $owner->post('/api/v1/admin/categories', ['name' => 'PlayStation'])->assertCreated();
        $owner->post('/api/v1/admin/categories', ['name' => 'Laptops'])->assertCreated();
        $before = Category::orderBy('id')->get(['id', 'name', 'slug', 'parent_id', 'position'])->toArray();

        $this->migration()->up();
        $this->migration()->up(); // again: nothing more

        $this->assertSame(1, $this->theCategory()->count());
        $added = $this->theCategory()->first();
        $this->assertSame('Electrical Appliances', $added->name);
        $this->assertTrue($added->is_visible);
        $this->assertGreaterThan(max(array_column($before, 'position')), $added->position); // listed after the others
        $this->assertSame($before, Category::whereKeyNot($added->id)->orderBy('id')->get(['id', 'name', 'slug', 'parent_id', 'position'])->toArray());

        $this->client()->get('/api/v1/catalog')->assertOk()->assertJsonFragment(['id' => $added->id, 'slug' => 'electrical-appliances']);
        $this->client()->get('/api/v1/categories/lookup?path=electrical-appliances')->assertOk()->assertJsonPath('data.name', 'Electrical Appliances');
        $owner->get('/api/v1/admin/categories')->assertOk()->assertJsonFragment(['id' => $added->id, 'name' => 'Electrical Appliances']);
    }

    public function test_an_existing_one_is_never_duplicated(): void
    {
        $this->owner()->post('/api/v1/admin/categories', ['name' => 'Electrical Appliances'])->assertCreated();
        $this->migration()->up();
        $this->assertSame(1, $this->theCategory()->count());
    }

    public function test_rolling_back_removes_it_only_while_nothing_uses_it(): void
    {
        $this->owner()->post('/api/v1/admin/categories', ['name' => 'Laptops'])->assertCreated();
        $this->migration()->up();
        $id = $this->theCategory()->value('id');
        $product = Product::factory()->create();
        $product->categories()->attach($id, ['is_primary' => true]);

        $this->migration()->down();
        $this->assertSame(1, $this->theCategory()->count(), 'a category with products stays');

        $product->categories()->detach($id);
        $this->migration()->down();
        $this->assertSame(0, $this->theCategory()->count());
    }
}
