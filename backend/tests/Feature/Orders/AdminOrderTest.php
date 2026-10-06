<?php

namespace Tests\Feature\Orders;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/** The owner's order management and customer views. */
class AdminOrderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function place(Product $p, int $qty = 1, ?User $user = null, string $email = 'guest@example.com'): int
    {
        $browser = $user ? $this->buyer($user) : $this->client();

        return $browser->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => $qty]],
            'contact' => ['first_name' => 'Maya', 'last_name' => 'Khoury', 'email' => $email, 'phone' => '+961 71 000 111'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->json('data.id');
    }

    public function test_the_owner_lists_filters_and_opens_every_order(): void
    {
        $p = Product::factory()->create(['stock_quantity' => 20]);
        $buyer = User::factory()->create();
        $mine = $this->place($p, 2, $buyer, $buyer->email);
        $guest = $this->place($p);
        $owner = $this->owner();

        $list = $owner->get('/api/v1/admin/orders')->assertOk();
        $this->assertEqualsCanonicalizing([$mine, $guest], array_column($list->json('data'), 'id'));
        $list->assertJsonPath('meta.counts.pending', 2)->assertJsonPath('meta.counts.all', 2);
        $this->assertSame([$guest], array_column($owner->get('/api/v1/admin/orders?q=guest@example')->json('data'), 'id'));
        $this->assertSame([$mine], array_column($owner->get("/api/v1/admin/orders?customer={$buyer->id}")->json('data'), 'id'));

        $owner->get("/api/v1/admin/orders/{$mine}")->assertOk()->assertJsonPath('data.user_id', $buyer->id)
            ->assertJsonPath('data.next_statuses', ['processing', 'on_hold', 'completed', 'cancelled'])
            ->assertJsonPath('meta.customer.orders', 1);
    }

    public function test_status_changes_follow_the_rules_and_move_stock(): void
    {
        $p = Product::factory()->create(['stock_quantity' => 3]);
        $id = $this->place($p, 2);
        $owner = $this->owner();

        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'processing', 'note' => 'Confirmed by phone'])->assertOk()->assertJsonPath('data.status', 'processing');
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'pending'])->assertStatus(409)->assertJsonPath('error.code', 'STATUS_NOT_ALLOWED');
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'shipped'])->assertStatus(422);

        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(3, $p->fresh()->stock_quantity, 'cancelled: back on the shelf');

        // Reopening takes the stock again, and is refused if it's gone meanwhile.
        $p->forceFill(['stock_quantity' => 1])->save();
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'processing'])->assertStatus(409)->assertJsonPath('error.code', 'INSUFFICIENT_STOCK');
        $this->assertSame('cancelled', Order::find($id)->status);
        $p->forceFill(['stock_quantity' => 5])->save();
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'processing'])->assertOk();
        $this->assertSame(3, $p->fresh()->stock_quantity);

        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'completed'])->assertOk()->assertJsonPath('data.payment_status', 'paid');
        $history = $owner->get("/api/v1/admin/orders/{$id}")->json('data.history');
        $this->assertSame(['pending', 'processing', 'cancelled', 'processing', 'completed'], array_values(array_filter(array_column($history, 'to'))));
        $this->assertSame('Confirmed by phone', $history[1]['note']);
        $this->assertSame('DMD World', $history[1]['by']);
    }

    public function test_payment_and_private_notes(): void
    {
        $id = $this->place(Product::factory()->create());
        $owner = $this->owner();
        $owner->put("/api/v1/admin/orders/{$id}/payment", ['payment_status' => 'paid'])->assertOk()->assertJsonPath('data.payment_status', 'paid');
        $owner->put("/api/v1/admin/orders/{$id}/payment", ['payment_status' => 'free'])->assertStatus(422);
        $owner->post("/api/v1/admin/orders/{$id}/notes", ['note' => 'Wants evening delivery'])->assertOk();
        $this->assertSame('Wants evening delivery', collect($owner->get("/api/v1/admin/orders/{$id}")->json('data.history'))->last()['note']);
    }

    public function test_customers_registered_and_guests_with_their_spending(): void
    {
        $p = Product::factory()->create(['regular_price' => '10.00', 'stock_quantity' => 50]);
        $buyer = User::factory()->create(['first_name' => 'Maya']);
        $paid = $this->place($p, 3, $buyer);
        $this->place($p, 1, $buyer); // still pending: not counted as spent
        $this->place($p, 2, null, 'walkin@example.com');
        Order::find($paid)->forceFill(['status' => 'completed'])->save();
        $owner = $this->owner();

        $row = collect($owner->get('/api/v1/admin/customers')->assertOk()->json('data'))->firstWhere('id', $buyer->id);
        $this->assertSame([2, 30], [$row['orders'], $row['spent']]);
        $guests = $owner->get('/api/v1/admin/customers?type=guest')->assertOk()->json('data');
        $this->assertSame(['walkin@example.com', 1], [$guests[0]['email'], $guests[0]['orders']]);

        $owner->get("/api/v1/admin/customers/{$buyer->id}")->assertOk()->assertJsonCount(2, 'data.orders')->assertJsonPath('data.spent', 30);
        $owner->put("/api/v1/admin/customers/{$buyer->id}", ['phone' => '+961 1 234 567', 'password' => 'Hijack-1!'])->assertOk()->assertJsonPath('data.phone', '+961 1 234 567');
        $this->assertNotNull($buyer->fresh()->password);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check(\Database\Factories\UserFactory::DEFAULT_PASSWORD, $buyer->fresh()->password), 'the owner can’t set a buyer’s password');
    }

    public function test_buyers_and_guests_cannot_reach_order_management(): void
    {
        $id = $this->place(Product::factory()->create());
        foreach ([$this->client(), $this->buyer()] as $browser) {
            $browser->get('/api/v1/admin/orders')->assertUnauthorized();
            $browser->put("/api/v1/admin/orders/{$id}/status", ['status' => 'completed'])->assertUnauthorized();
            $browser->get('/api/v1/admin/customers')->assertUnauthorized();
        }
        $this->assertSame('pending', Order::find($id)->status);
    }
}
