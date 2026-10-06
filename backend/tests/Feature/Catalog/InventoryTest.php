<?php

namespace Tests\Feature\Catalog;

use App\Models\InventoryMovement;
use App\Models\Product;
use App\Services\Inventory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryTest extends TestCase
{
    use RefreshDatabase;

    private function availabilityOf(Product $p): array
    {
        $public = $this->client()->get("/api/v1/products/{$p->id}")->json('data');

        return [$public['availability'], $public['stock_left']];
    }

    public function test_one_stock_number_drives_availability_everywhere(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['stock_quantity' => 10, 'low_stock_threshold' => 3]);

        $this->assertSame(['in_stock', null], $this->availabilityOf($p), 'exact stock is not shared while plentiful');

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => 2, 'note' => 'Stocktake'])->assertOk()
            ->assertJsonPath('data.availability', 'low_stock')->assertJsonPath('data.stock_quantity', 2);
        $this->assertSame(['low_stock', 2], $this->availabilityOf($p), '"Only 2 left"');
        $this->assertSame(2, collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id)['stock_left']);

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['adjust' => -2])->assertOk()->assertJsonPath('data.availability', 'out_of_stock');
        $this->assertSame(['out_of_stock', null], $this->availabilityOf($p));
        $this->assertNotContains($p->id, array_column($this->client()->get('/api/v1/products?in_stock=1')->json('data'), 'id'));

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['adjust' => 12])->assertOk()->assertJsonPath('data.stock_quantity', 12);
        $this->assertSame(['in_stock', null], $this->availabilityOf($p));
    }

    public function test_every_change_leaves_a_movement_line_with_who_and_why(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['stock_quantity' => 5]);
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['adjust' => 3, 'note' => 'Delivery from supplier'])->assertOk();
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => 6])->assertOk();

        $this->assertSame([[3, 8, 'restock'], [-2, 6, 'adjustment']], InventoryMovement::orderBy('id')->get()->map(fn ($m) => [$m->quantity_change, $m->quantity_after, $m->reason])->all());
        $this->assertNotNull(InventoryMovement::first()->admin_id);
        $owner->get("/api/v1/admin/inventory/{$p->id}/movements")->assertOk()
            ->assertJsonPath('data.0.change', -2)->assertJsonPath('data.1.note', 'Delivery from supplier')->assertJsonPath('data.1.by', 'DMD World');
    }

    public function test_stock_can_never_go_below_zero(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['stock_quantity' => 2]);

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['adjust' => -3])->assertStatus(409)->assertJsonPath('error.code', 'INSUFFICIENT_STOCK');
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => -1])->assertStatus(422);
        $this->assertSame(2, $p->fresh()->stock_quantity);
        $this->assertSame(0, InventoryMovement::count());

        $this->expectExceptionMessage('Only 2 of');
        app(Inventory::class)->adjust($p, -5, 'order');
    }

    public function test_untracked_products_use_their_manual_availability(): void
    {
        $owner = $this->owner();
        $p = Product::factory()->create(['track_stock' => false, 'stock_quantity' => 0]);
        $this->assertSame(['in_stock', null], $this->availabilityOf($p));

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_status' => 'out_of_stock'])->assertOk();
        $this->assertSame(['out_of_stock', null], $this->availabilityOf($p));
    }

    public function test_the_stock_screen_lists_sold_out_first_with_counts(): void
    {
        $owner = $this->owner();
        $ok = Product::factory()->create(['stock_quantity' => 50]);
        $low = Product::factory()->create(['stock_quantity' => 1]);
        $out = Product::factory()->create(['stock_quantity' => 0]);

        $all = $owner->get('/api/v1/admin/inventory')->assertOk();
        $this->assertSame([$out->id, $low->id, $ok->id], array_column($all->json('data'), 'id'));
        $all->assertJsonPath('meta.counts', ['out' => 1, 'low' => 1, 'in' => 1, 'untracked' => 0]);
        $this->assertSame([$low->id], array_column($owner->get('/api/v1/admin/inventory?level=low')->json('data'), 'id'));
    }
}
