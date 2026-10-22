<?php

namespace Tests\Feature\Orders;

use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * How many a buyer may order comes from the product's stock in MySQL, never from a fixed number: 18 in stock means
 * up to 18, 0 means none, and an untracked product has no stock limit. The API enforces it whatever the page sent.
 */
class StockLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function order(array $items): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(), 'items' => $items,
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ];
    }

    private function quoteLine(Product $p, int $qty): array
    {
        return $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $p->id, 'quantity' => $qty]]])->assertOk()->json('data.lines.0');
    }

    public function test_the_catalog_says_how_many_can_be_bought(): void
    {
        $stocks = [0, 1, 5, 18];
        $products = array_map(fn ($n) => Product::factory()->stock($n)->create(), $stocks);
        $untracked = Product::factory()->create(['track_stock' => false, 'stock_status' => 'in_stock']);

        $catalog = collect($this->getJson('/api/v1/catalog')->assertOk()->json('products'))->keyBy('id');
        foreach ($products as $i => $p) {
            $this->assertSame($stocks[$i], $catalog[$p->id]['max_quantity'], "stock {$stocks[$i]}");
        }
        $this->assertNull($catalog[$untracked->id]['max_quantity'], 'no stock limit when stock is not tracked');
        $this->getJson("/api/v1/products/{$products[3]->id}")->assertOk()->assertJsonPath('data.max_quantity', 18);
    }

    public function test_the_quote_allows_exactly_the_stock(): void
    {
        foreach ([1, 5, 18] as $stock) {
            $p = Product::factory()->stock($stock)->create();
            $ok = $this->quoteLine($p, $stock);
            $this->assertNull($ok['problem'], "{$stock} of {$stock}");
            $this->assertSame($stock, $ok['max_quantity']);
            $over = $this->quoteLine($p, $stock + 1);
            $this->assertSame(['LOW_STOCK', $stock], [$over['code'], $over['max_quantity']], ($stock + 1)." of {$stock}");
        }
        $soldOut = Product::factory()->stock(0)->create();
        $this->assertSame('SOLD_OUT', $this->quoteLine($soldOut, 1)['code']);
    }

    public function test_eighteen_in_stock_can_all_be_ordered_and_the_stock_reaches_zero(): void
    {
        $p = Product::factory()->stock(18)->create();

        $id = $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 18]]))->assertCreated()->json('data.id');

        $this->assertSame(0, $p->fresh()->stock_quantity);
        $this->assertSame(-18, (int) InventoryMovement::where('order_id', $id)->value('quantity_change'));
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 1]]))
            ->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
        $this->assertSame(0, $p->fresh()->stock_quantity, 'never below zero');
    }

    public function test_what_is_already_ordered_or_in_the_same_cart_counts(): void
    {
        $p = Product::factory()->stock(18)->create();

        // 15 in the cart and 10 more (two colour lines of one product): 25 > 18 is refused, nothing is written.
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 15], ['product_id' => $p->id, 'quantity' => 10]]))
            ->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        $this->assertSame([0, 18], [Order::count(), $p->fresh()->stock_quantity]);

        // 15 + 3 = 18 is fine; then only 0 are left for the next buyer.
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 15], ['product_id' => $p->id, 'quantity' => 3]]))->assertCreated();
        $this->assertSame(0, $p->fresh()->stock_quantity);

        // Stock taken by an earlier order: 10 then 9 of 18 leaves 8, so the second is refused.
        $q = Product::factory()->stock(18)->create();
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $q->id, 'quantity' => 10]]))->assertCreated();
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $q->id, 'quantity' => 9]]))
            ->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        $this->assertSame(8, $q->fresh()->stock_quantity);
    }

    public function test_untracked_products_have_no_stock_limit_but_absurd_input_is_refused(): void
    {
        $p = Product::factory()->create(['track_stock' => false, 'stock_status' => 'in_stock']);

        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $p->id, 'quantity' => 50]]))->assertCreated();
        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $p->id, 'quantity' => 1_000_001]]])->assertStatus(422);

        // More than the order columns can hold is refused, never stored wrong.
        $dear = Product::factory()->create(['track_stock' => false, 'stock_status' => 'in_stock', 'regular_price' => '99999999.99']);
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $dear->id, 'quantity' => 2]]))
            ->assertStatus(409)->assertJsonPath('error.code', 'TOO_LARGE');
    }
}
