<?php

namespace Tests\Feature\Catalog;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Buy Used: second-hand products sold by DMD are ordinary products with a condition. */
class UsedProductTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '/api/v1/admin/products';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function buy(Product $p): \Illuminate\Testing\TestResponse
    {
        return $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ]);
    }

    public function test_the_owner_lists_a_product_as_used_with_its_condition_and_the_shop_shows_it(): void
    {
        $owner = $this->owner();
        $console = Product::factory()->stock(1)->create(['name' => 'PS5 Slim (used)']);
        $new = Product::factory()->create();

        $owner->put(self::ADMIN."/{$console->id}", ['condition' => 'excellent', 'condition_note' => 'Box and one controller included.'])->assertOk()
            ->assertJsonPath('data.condition', 'excellent')->assertJsonPath('data.condition_note', 'Box and one controller included.');
        $owner->put(self::ADMIN."/{$console->id}", ['condition' => 'mint'])->assertStatus(422)->assertJsonPath('error.fields.condition.0', 'Choose Like New, Excellent, Good or Fair (or New for a product that isn’t used).');
        $owner->put(self::ADMIN."/{$console->id}", ['condition_note' => '<script>'])->assertStatus(422);

        $this->assertSame([$console->id], collect($owner->get(self::ADMIN.'?condition=used')->assertOk()->json('data'))->pluck('id')->all());
        $this->assertNotContains($console->id, collect($owner->get(self::ADMIN.'?condition=new')->json('data'))->pluck('id')->all());

        $catalog = collect($this->client()->get('/api/v1/catalog')->assertOk()->json('products'))->keyBy('id');
        $this->assertSame(['excellent', 'Box and one controller included.'], [$catalog[$console->id]['condition'], $catalog[$console->id]['condition_note']]);
        $this->assertNull($catalog[$new->id]['condition']);

        // Taken off Buy Used: it's a new product again and its note goes with it; the product itself stays.
        $owner->put(self::ADMIN."/{$console->id}", ['condition' => null])->assertOk()->assertJsonPath('data.condition', null)->assertJsonPath('data.condition_note', null);
        $this->assertNotNull(Product::find($console->id));
    }

    public function test_a_single_used_item_sells_once_and_a_cancellation_puts_it_back(): void
    {
        $owner = $this->owner();
        $pad = Product::factory()->stock(1)->create(['name' => 'DualSense (used)', 'condition' => 'good']);

        $first = $this->buy($pad)->assertCreated();
        $first->assertJsonPath('data.items.0.options', [['name' => 'Condition', 'value' => 'Used · Good']]);
        $this->assertSame(0, $pad->fresh()->stock_quantity);

        // The one unit is gone: the next buyer is refused, before and at checkout, and nothing goes negative.
        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $pad->id, 'quantity' => 1]]])->assertOk()->assertJsonPath('data.lines.0.code', 'SOLD_OUT');
        $this->buy($pad)->assertStatus(409);
        $this->assertSame(0, $pad->fresh()->stock_quantity);

        $owner->put("/api/v1/admin/orders/{$first->json('data.id')}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(1, $pad->fresh()->stock_quantity);
        $this->buy($pad)->assertCreated(); // for sale again
    }

    public function test_an_order_keeps_the_condition_it_was_sold_in(): void
    {
        $owner = $this->owner();
        $game = Product::factory()->stock(2)->create(['condition' => 'like_new']);
        $id = $this->buy($game)->assertCreated()->json('data.id');

        $owner->put(self::ADMIN."/{$game->id}", ['condition' => 'fair'])->assertOk();
        $this->assertSame([['name' => 'Condition', 'value' => 'Used · Like New']], Order::find($id)->items->first()->variant_options);
        $owner->get("/api/v1/admin/orders/{$id}")->assertOk()->assertJsonPath('data.items.0.options.0.value', 'Used · Like New');
    }
}
