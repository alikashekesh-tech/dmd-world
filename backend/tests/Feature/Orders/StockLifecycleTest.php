<?php

namespace Tests\Feature\Orders;

use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Stock follows the order, never the cart: an order takes its units, a cancellation or a refund (when the goods come
 * back) returns exactly what the order still holds, once, and stock never goes below zero.
 */
class StockLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** @return array{0: int, 1: string} order id and guest token */
    private function place(Product $p, int $qty, ?SpaClient $browser = null): array
    {
        $r = ($browser ?? $this->client())->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => $qty]],
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated();

        return [$r->json('data.id'), (string) $r->json('meta.guest_token')];
    }

    private function moveTo(SpaClient $owner, int $id, string $to, array $extra = []): void
    {
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => $to, ...$extra])->assertOk();
    }

    private function held(int $orderId): int
    {
        return (int) OrderItem::where('order_id', $orderId)->sum('stock_held');
    }

    public function test_adding_to_a_cart_takes_nothing_an_order_takes_its_units_and_a_cancellation_returns_them(): void
    {
        $p = Product::factory()->stock(18)->create();
        // A quote is what the cart asks for: nothing is reserved.
        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $p->id, 'quantity' => 3]]])->assertOk();
        $this->assertSame(18, $p->fresh()->stock_quantity);

        [$id, $token] = $this->place($p, 3);
        $this->assertSame([15, 3], [$p->fresh()->stock_quantity, $this->held($id)]);

        $this->client()->post("/api/v1/orders/{$id}/cancel", ['token' => $token])->assertOk();
        $this->assertSame([18, 0], [$p->fresh()->stock_quantity, $this->held($id)]);
        $this->assertSame([-3, 3], InventoryMovement::where('order_id', $id)->orderBy('id')->pluck('quantity_change')->all(), 'both changes are in the stock history');
    }

    public function test_the_last_units_sold_out_refuse_the_next_purchase(): void
    {
        $p = Product::factory()->stock(18)->create();
        $this->place($p, 18);

        $this->assertSame(0, $p->fresh()->stock_quantity);
        $this->getJson("/api/v1/products/{$p->id}")->assertJsonPath('data.availability', 'out_of_stock')->assertJsonPath('data.max_quantity', 0);
        $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Sami', 'last_name' => 'Aoun', 'email' => 'sami@example.com', 'phone' => '+961 70 123 457'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
        $this->assertSame(0, $p->fresh()->stock_quantity, 'never below zero');
    }

    public function test_cancelling_twice_or_moving_through_statuses_never_returns_stock_twice(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->place($p, 3);
        $owner = $this->owner();

        $this->moveTo($owner, $id, 'cancelled');
        $this->moveTo($owner, $id, 'cancelled'); // the same status again: nothing happens
        $this->assertSame(18, $p->fresh()->stock_quantity);

        // Reopened: the units are taken again; cancelled again: returned again. Balanced, never doubled.
        $this->moveTo($owner, $id, 'processing');
        $this->assertSame([15, 3], [$p->fresh()->stock_quantity, $this->held($id)]);
        $this->moveTo($owner, $id, 'cancelled');
        $this->assertSame([18, 0], [$p->fresh()->stock_quantity, $this->held($id)]);
        $this->assertSame(0, (int) InventoryMovement::where('order_id', $id)->sum('quantity_change'), 'the ledger nets to zero');
    }

    public function test_a_refund_returns_the_stock_once_when_the_goods_come_back(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->place($p, 3);
        $owner = $this->owner();
        $this->moveTo($owner, $id, 'completed');
        $this->assertSame(15, $p->fresh()->stock_quantity, 'a completed order still holds its units');

        $this->moveTo($owner, $id, 'refunded'); // restock is the default
        $this->assertSame([18, 0], [$p->fresh()->stock_quantity, $this->held($id)]);
        $this->assertSame(1, InventoryMovement::where('order_id', $id)->where('reason', 'refund')->count());

        // Refunded is final: asking again changes nothing, and no other status can return the stock a second time.
        $this->moveTo($owner, $id, 'refunded');
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'cancelled'])->assertStatus(409);
        $this->assertSame(18, $p->fresh()->stock_quantity);
    }

    public function test_a_refund_without_the_goods_back_leaves_stock_alone(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->place($p, 3);
        $owner = $this->owner();
        $this->moveTo($owner, $id, 'completed');

        $this->moveTo($owner, $id, 'refunded', ['restock' => false]);

        $this->assertSame([15, 0], [$p->fresh()->stock_quantity, $this->held($id)]);
        $this->assertSame('refunded', Order::find($id)->payment_status);
        $this->assertFalse(InventoryMovement::where('order_id', $id)->where('reason', 'refund')->exists());
    }

    public function test_units_that_were_never_taken_are_never_returned(): void
    {
        // Not tracked when ordered (nothing taken), tracked by the time it's cancelled: no phantom units appear.
        $p = Product::factory()->create(['track_stock' => false, 'stock_status' => 'in_stock', 'stock_quantity' => 7]);
        [$id, $token] = $this->place($p, 2);
        $p->forceFill(['track_stock' => true])->save();

        $this->client()->post("/api/v1/orders/{$id}/cancel", ['token' => $token])->assertOk();

        $this->assertSame(7, $p->fresh()->stock_quantity);
    }

    public function test_a_reopened_order_needs_the_stock_to_still_be_there(): void
    {
        $p = Product::factory()->stock(3)->create();
        [$id] = $this->place($p, 3);
        $owner = $this->owner();
        $this->moveTo($owner, $id, 'cancelled');
        $this->place($p, 3); // someone else bought them meanwhile

        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'processing'])->assertStatus(409)->assertJsonPath('error.code', 'INSUFFICIENT_STOCK');
        $this->assertSame(['cancelled', 0, 0], [Order::find($id)->status, $p->fresh()->stock_quantity, $this->held($id)]);
    }

    public function test_existing_orders_get_what_they_hold_from_the_ledger_or_the_old_store_rule(): void
    {
        $p = Product::factory()->stock(10)->create();
        [$placedHere] = $this->place($p, 2);                    // ledger: −2
        [$cancelledHere, $token] = $this->place($p, 1);
        $this->client()->post("/api/v1/orders/{$cancelledHere}/cancel", ['token' => $token])->assertOk(); // ledger: −1 +1
        $imported = $this->place($p, 4)[0];
        Order::whereKey($imported)->update(['idempotency_hash' => null, 'status' => 'processing']); // as the importer leaves it
        InventoryMovement::where('order_id', $imported)->delete();
        $importedPending = $this->place($p, 1)[0];
        Order::whereKey($importedPending)->update(['idempotency_hash' => null, 'status' => 'pending']);
        InventoryMovement::where('order_id', $importedPending)->delete();
        DB::table('order_items')->update(['stock_held' => 0]); // as before the migration

        (require database_path('migrations/2026_10_08_001000_add_stock_held_to_order_items.php'))->backfill();

        $this->assertSame([2, 0, 4, 0], [$this->held($placedHere), $this->held($cancelledHere), $this->held($imported), $this->held($importedPending)]);
    }
}
