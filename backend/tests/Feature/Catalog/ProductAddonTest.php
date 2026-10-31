<?php

namespace Tests\Feature\Catalog;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Recommended add-ons: the owner picks a few other products for a product ("Complete your setup"). The storefront
 * catalog lists the ones it can show, in the owner's order; a product can't recommend itself, and nothing is ever
 * added to a cart or an order by this (checkout prices only what the buyer sent).
 */
class ProductAddonTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_owner_picks_add_ons_and_the_catalog_lists_the_ones_on_sale_in_order(): void
    {
        $laptop = Product::factory()->create(['name' => 'Gaming Laptop']);
        [$mouse, $bag, $pad] = Product::factory()->count(3)->create();
        $draft = Product::factory()->draft()->create();
        $owner = $this->owner();

        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => [$bag->id, $mouse->id, $draft->id, $pad->id]])->assertOk();
        $this->assertSame([$bag->id, $mouse->id, $draft->id, $pad->id], $owner->get("/api/v1/admin/products/{$laptop->id}")->json('data.addon_ids'));

        $listed = collect($this->client()->get('/api/v1/catalog')->json('products'))->keyBy('id');
        $this->assertSame([$bag->id, $mouse->id, $pad->id], $listed[$laptop->id]['addon_ids'], 'a draft add-on isn’t shown');
        $this->assertSame([], $listed[$mouse->id]['addon_ids']);

        $pad->delete(); // archived: no longer shown
        $this->assertSame([$bag->id, $mouse->id], collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $laptop->id)['addon_ids']);

        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => []])->assertOk();
        $this->assertSame([], collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $laptop->id)['addon_ids']);
    }

    public function test_add_ons_are_checked(): void
    {
        $laptop = Product::factory()->create();
        $owner = $this->owner();
        $others = Product::factory()->count(Product::MAX_ADDONS + 1)->create()->pluck('id')->all();

        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => [$laptop->id]])->assertStatus(422)->assertJsonValidationErrors('addon_ids.0', 'error.fields');
        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => $others])->assertStatus(422)->assertJsonValidationErrors('addon_ids', 'error.fields');
        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => [987654]])->assertStatus(422)->assertJsonValidationErrors('addon_ids.0', 'error.fields');
        $owner->put("/api/v1/admin/products/{$laptop->id}", ['addon_ids' => [$others[0], $others[0]]])->assertStatus(422);
        $this->assertSame(0, $laptop->addons()->count());

        // Creating a product with add-ons works too.
        $id = $owner->post('/api/v1/admin/products', ['name' => 'Desk Setup', 'regular_price' => 99, 'status' => 'published', 'addon_ids' => [$others[1]]])->assertCreated()->json('data.id');
        $this->assertSame([$others[1]], Product::find($id)->addons()->pluck('products.id')->all());
    }
}
