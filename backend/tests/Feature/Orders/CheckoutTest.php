<?php

namespace Tests\Feature\Orders;

use App\Models\Address;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Notifications\OrderPlaced;
use App\Services\Catalog;
use App\Services\Inventory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class CheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function order(array $items, array $over = []): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(),
            'items' => $items,
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'delivery',
            'payment_method' => 'cod',
            'address' => ['city' => 'Beirut', 'area' => 'Hamra', 'street' => 'Bliss Street', 'building' => 'Rose', 'floor' => '3'],
            'note' => 'Call before coming',
            ...$over,
        ];
    }

    public function test_a_quote_prices_the_cart_from_mysql_and_flags_problems(): void
    {
        $plain = Product::factory()->create(['regular_price' => '25.00']);
        $sale = Product::factory()->create(['regular_price' => '30.00', 'sale_price' => '20.00']);
        $low = Product::factory()->create(['stock_quantity' => 2]);
        $gone = Product::factory()->create(['stock_quantity' => 0]);
        $draft = Product::factory()->draft()->create();

        $q = $this->client()->post('/api/v1/cart/quote', ['items' => [
            ['product_id' => $plain->id, 'quantity' => 2, 'price' => 0.01], ['product_id' => $sale->id, 'quantity' => 1],
            ['product_id' => $low->id, 'quantity' => 3], ['product_id' => $gone->id, 'quantity' => 1], ['product_id' => $draft->id, 'quantity' => 1],
        ], 'total' => 1])->assertOk()->json('data');

        $lines = collect($q['lines'])->keyBy('product_id');
        $this->assertSame([25, 50], [$lines[$plain->id]['unit_price'], $lines[$plain->id]['line_total']], 'the browser’s price is ignored');
        $this->assertSame([20, 30], [$lines[$sale->id]['unit_price'], $lines[$sale->id]['regular_price']]);
        $this->assertSame(['LOW_STOCK', 2], [$lines[$low->id]['code'], $lines[$low->id]['max_quantity']]);
        $this->assertSame('SOLD_OUT', $lines[$gone->id]['code']);
        $this->assertSame('UNAVAILABLE', $lines[$draft->id]['code']);
        $this->assertSame(70, $q['subtotal'], 'lines with problems are left out of the total');
        $this->assertFalse($q['ok']);
    }

    public function test_a_guest_places_an_order_priced_and_stocked_by_the_server(): void
    {
        $a = Product::factory()->create(['regular_price' => '25.00', 'stock_quantity' => 5]);
        $b = Product::factory()->create(['regular_price' => '30.00', 'sale_price' => '20.00', 'stock_quantity' => 1]);

        $res = $this->client()->post('/api/v1/orders', $this->order(
            [['product_id' => $a->id, 'quantity' => 2, 'unit_price' => 0.5], ['product_id' => $b->id, 'quantity' => 1]],
            ['total' => 1, 'subtotal' => 1, 'discount_total' => 999, 'status' => 'completed', 'user_id' => 1],
        ))->assertCreated();

        $res->assertJsonPath('data.status', 'pending')->assertJsonPath('data.subtotal', 70)->assertJsonPath('data.total', 70)
            ->assertJsonPath('data.items.0.unit_price', 25)->assertJsonPath('data.address.street', 'Bliss Street')
            ->assertJsonPath('data.contact.email', 'rima@example.com');
        $this->assertNotNull($res->json('meta.guest_token'));
        $order = Order::findOrFail($res->json('data.id'));
        $this->assertNull($order->user_id);
        $this->assertSame((string) $order->id, $order->number);
        $this->assertGreaterThanOrEqual(1000000, $order->id);
        $this->assertSame([3, 0], [$a->fresh()->stock_quantity, $b->fresh()->stock_quantity]);
        $this->assertSame(2, InventoryMovement::where('order_id', $order->id)->where('reason', 'order')->count());
        Notification::assertSentTo(new AnonymousNotifiable, OrderPlaced::class, fn ($n, $c, $to) => $to->routes['mail'] === 'rima@example.com');

        // The last unit is gone for the next buyer.
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $b->id, 'quantity' => 1]]))->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
    }

    public function test_problems_are_refused_and_nothing_is_written(): void
    {
        $ok = Product::factory()->create(['stock_quantity' => 5]);
        $low = Product::factory()->create(['stock_quantity' => 1]);

        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $ok->id, 'quantity' => 1], ['product_id' => $low->id, 'quantity' => 2]]))
            ->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $ok->id, 'quantity' => 6]]))->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $ok->id, 'quantity' => 0]]))->assertStatus(422);
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => 99999999, 'quantity' => 1]]))->assertStatus(409)->assertJsonPath('error.code', 'UNAVAILABLE');

        $this->assertSame(0, Order::count());
        $this->assertSame([5, 1], [$ok->fresh()->stock_quantity, $low->fresh()->stock_quantity]);
    }

    public function test_a_failure_halfway_rolls_everything_back(): void
    {
        $a = Product::factory()->create(['stock_quantity' => 5]);
        $b = Product::factory()->create(['stock_quantity' => 5]);
        // The second stock change fails (as if the database broke mid-order).
        $this->app->instance(Inventory::class, new class extends Inventory
        {
            private int $calls = 0;

            public function adjust($product, int $change, string $reason, $by = null, ?string $note = null, ?int $orderId = null): Product
            {
                if (++$this->calls === 2) {
                    throw new RuntimeException('disk full');
                }

                return parent::adjust($product, $change, $reason, $by, $note, $orderId);
            }
        });

        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $a->id, 'quantity' => 2], ['product_id' => $b->id, 'quantity' => 1]]))
            ->assertStatus(500)->assertJsonPath('error.code', 'SERVER_ERROR');

        $this->assertSame(0, Order::count());
        $this->assertSame(0, InventoryMovement::count());
        $this->assertSame([5, 5], [$a->fresh()->stock_quantity, $b->fresh()->stock_quantity], 'the first line’s stock change was undone');
    }

    public function test_a_retried_submit_returns_the_first_order_instead_of_a_second(): void
    {
        $p = Product::factory()->create(['stock_quantity' => 5]);
        $form = $this->order([['product_id' => $p->id, 'quantity' => 1]]);
        $browser = $this->client();

        $first = $browser->post('/api/v1/orders', $form)->assertCreated();
        $again = $browser->post('/api/v1/orders', $form)->assertOk()->assertJsonPath('meta.replayed', true);

        $this->assertSame($first->json('data.id'), $again->json('data.id'));
        $this->assertSame($first->json('meta.guest_token'), $again->json('meta.guest_token'), 'the retry can still open the order');
        $this->assertSame(1, Order::count());
        $this->assertSame(4, $p->fresh()->stock_quantity);

        // Someone else reusing that key doesn't get the order.
        $this->client()->post('/api/v1/orders', [...$form, 'contact' => [...$form['contact'], 'email' => 'someone@example.com']])
            ->assertStatus(409)->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');
    }

    public function test_a_signed_in_buyer_orders_to_a_saved_address(): void
    {
        $user = User::factory()->create();
        $mine = Address::factory()->for($user)->create(['is_default' => true, 'street' => 'Mine Street']);
        $theirs = Address::factory()->for(User::factory())->create(['street' => 'Their Street']);
        $p = Product::factory()->create();
        $browser = $this->buyer($user);

        $browser->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['address' => null, 'address_id' => $theirs->id]))
            ->assertStatus(422)->assertJsonPath('error.code', 'ADDRESS_NOT_FOUND');
        $res = $browser->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['address' => null, 'address_id' => $mine->id]))->assertCreated();

        $res->assertJsonPath('data.address.street', 'Mine Street')->assertJsonPath('meta.guest_token', null);
        $this->assertSame($user->id, Order::find($res->json('data.id'))->user_id);
        $this->assertSame([$res->json('data.id')], array_column($browser->get('/api/v1/orders')->json('data'), 'id'));

        // A typed address can be saved to the address book on the way.
        $browser->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['save_address' => true, 'address' => ['city' => 'Jounieh', 'street' => 'Sea Road']]))->assertCreated();
        $this->assertTrue($user->addresses()->where('street', 'Sea Road')->exists());
    }

    public function test_delivery_needs_an_address_pickup_does_not(): void
    {
        $p = Product::factory()->create();
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['address' => null]))
            ->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['address']]]);
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['address' => null, 'delivery_method' => 'pickup']))
            ->assertCreated()->assertJsonPath('data.address', null)->assertJsonPath('data.delivery_method', 'pickup');
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['contact' => ['first_name' => '', 'last_name' => 'X', 'email' => 'bad', 'phone' => '1']]))
            ->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['contact.first_name', 'contact.email', 'contact.phone']]]);
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]], ['payment_method' => 'bitcoin']))->assertStatus(422);
    }

    public function test_past_orders_keep_what_was_bought_even_after_the_product_changes(): void
    {
        $p = Product::factory()->create(['name' => 'Old Name', 'regular_price' => '40.00', 'sku' => 'OLD-SKU']);
        $browser = $this->client();
        $res = $browser->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]]))->assertCreated();
        $id = $res->json('data.id');
        $token = $res->json('meta.guest_token');

        $p->forceFill(['name' => 'New Name', 'regular_price' => '99.00', 'sku' => 'NEW-SKU'])->save();
        $later = $this->client()->get("/api/v1/orders/{$id}?token={$token}")->assertOk();
        $later->assertJsonPath('data.items.0.name', 'Old Name')->assertJsonPath('data.items.0.unit_price', 40)->assertJsonPath('data.items.0.sku', 'OLD-SKU')->assertJsonPath('data.total', 40);

        $p->forceDelete(); // even a product deleted for good
        $this->client()->get("/api/v1/orders/{$id}?token={$token}")->assertOk()->assertJsonPath('data.items.0.name', 'Old Name')->assertJsonPath('data.items.0.product_id', null);
    }

    public function test_paid_orders_count_as_sales_in_the_catalog(): void
    {
        $p = Product::factory()->create();
        $res = $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 3]]))->assertCreated();
        $sold = fn () => collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id)['units_sold'];
        $this->assertSame(0, $sold(), 'a pending (unpaid) order is not a sale yet');

        Order::find($res->json('data.id'))->forceFill(['status' => 'processing'])->save();
        Catalog::bust();
        $this->assertSame(3, $sold());
        $this->assertSame($p->id, $this->client()->get('/api/v1/products?sort=best')->json('data.0.id'));
    }
}
