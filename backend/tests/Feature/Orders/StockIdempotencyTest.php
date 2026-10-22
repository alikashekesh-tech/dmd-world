<?php

namespace Tests\Feature\Orders;

use App\Exceptions\ApiException;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderStatusEvent;
use App\Models\Product;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Stock is taken and given back once per real change, whatever path an order takes: repeated or racing requests,
 * status loops and refused transitions change nothing, and the stock history has exactly one line per real change.
 */
class StockIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private SpaClient $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->owner = $this->owner();
    }

    /** @return array{0: int, 1: string} order id and guest token */
    private function order(Product $p, int $qty, string $email = 'rima@example.com'): array
    {
        $r = $this->client()->post('/api/v1/orders', $this->body($p, $qty, $email))->assertCreated();

        return [$r->json('data.id'), (string) $r->json('meta.guest_token')];
    }

    private function body(Product $p, int $qty, string $email): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => $qty]],
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => $email, 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ];
    }

    private function ownerSets(int $id, string $to, int $expect = 200): void
    {
        $this->owner->put("/api/v1/admin/orders/{$id}/status", ['status' => $to])->assertStatus($expect);
    }

    private function stock(Product $p): int
    {
        return $p->fresh()->stock_quantity;
    }

    /** @return list<int> the order's stock history, oldest first */
    private function history(int $orderId): array
    {
        return InventoryMovement::where('order_id', $orderId)->orderBy('id')->pluck('quantity_change')->all();
    }

    // A
    public function test_a_cancellation_restores_the_order_once_however_often_it_is_asked(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id, $token] = $this->order($p, 3);
        $this->assertSame(15, $this->stock($p));

        $this->client()->post("/api/v1/orders/{$id}/cancel", ['token' => $token])->assertOk();
        $this->assertSame(18, $this->stock($p));

        $this->client()->post("/api/v1/orders/{$id}/cancel", ['token' => $token])->assertStatus(409)->assertJsonPath('error.code', 'NOT_CANCELLABLE');
        $this->ownerSets($id, 'cancelled'); // same status again: accepted, nothing happens
        $this->assertSame(18, $this->stock($p));
        $this->assertSame([-3, 3], $this->history($id));
        $this->assertSame(1, OrderStatusEvent::where('order_id', $id)->where('to_status', 'cancelled')->count(), 'one cancellation in the order history');
    }

    // B
    public function test_the_last_unit_goes_to_one_buyer_and_comes_back_on_cancel(): void
    {
        $p = Product::factory()->stock(1)->create();
        [$id, $token] = $this->order($p, 1);
        $this->assertSame(0, $this->stock($p));

        $this->client()->post('/api/v1/orders', $this->body($p, 1, 'second@example.com'))->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
        $this->assertSame(0, $this->stock($p));

        $this->client()->post("/api/v1/orders/{$id}/cancel", ['token' => $token])->assertOk();
        $this->assertSame(1, $this->stock($p));
        $this->assertSame(2, InventoryMovement::where('product_id', $p->id)->count(), 'the refused purchase left no stock history');
    }

    // C
    public function test_status_changes_and_loops_never_take_or_return_twice(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->order($p, 3);

        // Moves that don't concern stock: the order keeps its 3 units throughout.
        foreach (['processing', 'on_hold', 'processing', 'processing', 'completed'] as $to) {
            $this->ownerSets($id, $to);
            $this->assertSame(15, $this->stock($p), "after {$to}");
        }
        $this->ownerSets($id, 'cancelled', 409); // completed → cancelled isn't a move the store allows
        $this->assertSame([15, [-3]], [$this->stock($p), $this->history($id)]);

        // Cancel, reopen, cancel, reopen, cancel: stock never above 18 nor taken twice.
        [$loop] = $this->order($p, 3);
        $this->assertSame(12, $this->stock($p));
        foreach ([['cancelled', 15], ['processing', 12], ['cancelled', 15], ['pending', 12], ['cancelled', 15], ['cancelled', 15]] as [$to, $expected]) {
            $this->ownerSets($loop, $to);
            $this->assertSame($expected, $this->stock($p), "after {$to}");
        }
        $this->assertSame([-3, 3, -3, 3, -3, 3], $this->history($loop));
    }

    // D
    public function test_a_refund_returns_the_stock_exactly_once(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->order($p, 3);
        $this->ownerSets($id, 'completed');

        $this->ownerSets($id, 'refunded');
        $this->assertSame(18, $this->stock($p));

        $this->ownerSets($id, 'refunded');                // the same request again
        $this->ownerSets($id, 'cancelled', 409);           // refunded is final
        $this->ownerSets($id, 'processing', 409);
        $this->assertSame(18, $this->stock($p));
        $this->assertSame([-3, 3], $this->history($id));
        $this->assertSame(['order', 'refund'], InventoryMovement::where('order_id', $id)->orderBy('id')->pluck('reason')->all());
    }

    // E
    public function test_two_cancellations_racing_each_other_restore_once(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->order($p, 3);
        // Both requests loaded the order while it was still pending, before either ran.
        $first = Order::findOrFail($id);
        $second = Order::findOrFail($id);
        $orders = app(OrderService::class);

        $orders->changeStatus($first, 'cancelled', 'admin');
        $orders->changeStatus($second, 'cancelled', 'admin'); // finds it cancelled under the lock: nothing to do

        $this->assertSame([18, [-3, 3]], [$this->stock($p), $this->history($id)]);
    }

    // E
    public function test_a_buyer_cancel_racing_the_owners_confirmation_is_refused(): void
    {
        $p = Product::factory()->stock(18)->create();
        [$id] = $this->order($p, 3);
        $seenByBuyer = Order::findOrFail($id);               // the buyer's request passed its "still pending" check
        $this->ownerSets($id, 'processing');               // then the owner confirmed the order

        try {
            app(OrderService::class)->changeStatus($seenByBuyer, 'cancelled', 'buyer');
            $this->fail('the buyer cancelled a confirmed order');
        } catch (ApiException $e) {
            $this->assertSame('NOT_CANCELLABLE', $e->errorCode);
        }
        $this->assertSame(['processing', 15, [-3]], [Order::find($id)->status, $this->stock($p), $this->history($id)]);
    }

    // F
    public function test_the_stock_history_has_one_line_per_real_change_and_nothing_for_the_rest(): void
    {
        $p = Product::factory()->stock(5)->create();
        [$a, $tokenA] = $this->order($p, 3);                                     // change 1: −3 → 2
        $this->client()->post('/api/v1/orders', $this->body($p, 3, 'b@example.com'))->assertStatus(409); // refused: no change
        [$b] = $this->order($p, 2, 'b@example.com');                             // change 2: −2 → 0
        $this->client()->post("/api/v1/orders/{$a}/cancel", ['token' => $tokenA])->assertOk(); // change 3: +3 → 3
        $this->client()->post("/api/v1/orders/{$a}/cancel", ['token' => $tokenA])->assertStatus(409); // repeat: no change
        $this->ownerSets($b, 'completed');                                     // no stock effect
        $this->ownerSets($b, 'completed');                                     // repeat: nothing
        $this->ownerSets($b, 'refunded');                                      // change 4: +2 → 5
        $this->ownerSets($b, 'refunded');                                      // repeat: no change
        $this->ownerSets($a, 'processing');                                    // change 5: reopened, −3 → 2
        $this->client()->post('/api/v1/orders', $this->body($p, 3, 'c@example.com'))->assertStatus(409); // only 2 left

        $moves = InventoryMovement::where('product_id', $p->id)->orderBy('id')->get();
        $this->assertSame([-3, -2, 3, 2, -3], $moves->pluck('quantity_change')->all());
        $this->assertSame(['order', 'order', 'cancellation', 'refund', 'order'], $moves->pluck('reason')->all());
        $this->assertSame(2, $this->stock($p));
        $this->assertSame(5 + $moves->sum('quantity_change'), $this->stock($p), 'the history adds up to the stock');
        $this->assertSame($this->stock($p), $moves->last()->quantity_after);
    }
}
