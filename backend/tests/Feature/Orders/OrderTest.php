<?php

namespace Tests\Feature\Orders;

use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/** A buyer's (or guest's) own orders: privacy and cancelling. */
class OrderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function place(SpaClient $browser, Product $p, int $qty = 1): array
    {
        return $browser->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => $qty]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->json();
    }

    public function test_buyer_a_never_sees_buyer_bs_orders(): void
    {
        $p = Product::factory()->create();
        $alice = $this->buyer();
        $bob = $this->buyer();
        $aliceOrder = $this->place($alice, $p)['data']['id'];
        $bobOrder = $this->place($bob, $p)['data']['id'];

        $this->assertSame([$aliceOrder], array_column($alice->get('/api/v1/orders')->json('data'), 'id'));
        $alice->get("/api/v1/orders/{$aliceOrder}")->assertOk();
        $alice->get("/api/v1/orders/{$bobOrder}")->assertNotFound();
        $alice->post("/api/v1/orders/{$bobOrder}/cancel")->assertNotFound();
        $this->assertSame('pending', Order::find($bobOrder)->status);
        $this->client()->get('/api/v1/orders')->assertUnauthorized();
    }

    public function test_a_guest_opens_their_order_only_with_its_private_token(): void
    {
        $p = Product::factory()->create();
        $placed = $this->place($this->client(), $p);
        $id = $placed['data']['id'];
        $token = $placed['meta']['guest_token'];

        $this->client()->get("/api/v1/orders/{$id}?token={$token}")->assertOk()->assertJsonPath('data.id', $id);
        $this->client()->get("/api/v1/orders/{$id}")->assertNotFound();
        $this->client()->get("/api/v1/orders/{$id}?token=".str_repeat('a', 64))->assertNotFound();
        $this->buyer()->get("/api/v1/orders/{$id}")->assertNotFound(); // a signed-in stranger
        $this->client()->get('/api/v1/orders/'.($id + 1)."?token={$token}")->assertNotFound(); // the token opens only its own order
    }

    public function test_a_pending_order_can_be_cancelled_and_its_stock_returns(): void
    {
        $p = Product::factory()->create(['stock_quantity' => 4]);
        $browser = $this->buyer();
        $id = $this->place($browser, $p, 3)['data']['id'];
        $this->assertSame(1, $p->fresh()->stock_quantity);

        $browser->post("/api/v1/orders/{$id}/cancel", ['reason' => 'Ordered twice <b>by mistake</b>'])->assertOk()
            ->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.cancellable', false)
            ->assertJsonPath('data.cancel_reason', 'Ordered twice by mistake');
        $this->assertSame(4, $p->fresh()->stock_quantity);
        $this->assertTrue(InventoryMovement::where('order_id', $id)->where('reason', 'cancellation')->where('quantity_change', 3)->exists());

        $browser->post("/api/v1/orders/{$id}/cancel")->assertStatus(409)->assertJsonPath('error.code', 'NOT_CANCELLABLE');
        $this->assertSame(4, $p->fresh()->stock_quantity, 'cancelling twice doesn’t restock twice');
    }

    public function test_a_confirmed_order_can_no_longer_be_cancelled_by_the_buyer(): void
    {
        $p = Product::factory()->create();
        $browser = $this->buyer();
        $id = $this->place($browser, $p)['data']['id'];
        Order::find($id)->forceFill(['status' => 'processing'])->save();

        $browser->post("/api/v1/orders/{$id}/cancel")->assertStatus(409)->assertJsonPath('error.code', 'NOT_CANCELLABLE');
    }

    public function test_a_guest_cancels_with_their_token(): void
    {
        $p = Product::factory()->create(['stock_quantity' => 2]);
        $placed = $this->place($this->client(), $p);

        $this->client()->post("/api/v1/orders/{$placed['data']['id']}/cancel", ['token' => 'wrong'])->assertNotFound();
        $this->client()->post("/api/v1/orders/{$placed['data']['id']}/cancel", ['token' => $placed['meta']['guest_token']])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(2, $p->fresh()->stock_quantity);
    }

    public function test_orders_never_show_the_owners_private_notes(): void
    {
        $p = Product::factory()->create();
        $user = User::factory()->create();
        $browser = $this->buyer($user);
        $id = $this->place($browser, $p)['data']['id'];
        $this->owner()->post("/api/v1/admin/orders/{$id}/notes", ['note' => 'Buyer seemed unsure, call first'])->assertOk();

        $this->assertStringNotContainsString('unsure', $browser->get("/api/v1/orders/{$id}")->getContent());
    }
}
