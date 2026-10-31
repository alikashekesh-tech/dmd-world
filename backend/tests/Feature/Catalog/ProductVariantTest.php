<?php

namespace Tests\Feature\Catalog;

use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Products sold in variants, end to end: the owner sets them up, the catalog offers them, the server prices and stocks
 * each one, the order keeps what was bought and a cancellation puts that variant's units back once.
 */
class ProductVariantTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '/api/v1/admin/products';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** A gaming chair in three colours, each with its own price and stock; the white one has its own photo. */
    private function chair(SpaClient $owner): array
    {
        return $owner->post(self::ADMIN, [
            'name' => 'Megavolt Gaming Chair', 'status' => 'published', 'type' => 'variable',
            'images' => [['url' => '/storage/uploads/2026/10/chair-black.png'], ['url' => '/storage/uploads/2026/10/chair-white.png']],
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'Red', 'White']]],
            'variants' => [
                ['options' => ['Colour' => 'Black'], 'sku' => 'MV-CH-BK', 'regular_price' => 150, 'stock_quantity' => 4],
                ['options' => ['Colour' => 'Red'], 'sku' => 'MV-CH-RD', 'regular_price' => 150, 'sale_price' => 135, 'stock_quantity' => 1],
                ['options' => ['Colour' => 'White'], 'sku' => 'MV-CH-WH', 'regular_price' => 165, 'stock_quantity' => 0, 'image_url' => '/storage/uploads/2026/10/chair-white.png'],
            ],
        ])->assertCreated()->json('data');
    }

    private function variant(array $product, string $colour): array
    {
        return collect($product['variants'])->first(fn ($v) => $v['options']['Colour'] === $colour);
    }

    private function order(array $items): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(), 'items' => $items,
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ];
    }

    public function test_the_owner_sets_up_colours_with_their_own_price_stock_sku_and_photo_and_the_shop_offers_them(): void
    {
        $chair = $this->chair($this->owner());
        $this->assertSame('variable', $chair['type']);
        $this->assertCount(3, $chair['variants']);
        $this->assertSame(['MV-CH-RD', 135, 1], [$this->variant($chair, 'Red')['sku'], $this->variant($chair, 'Red')['price'], $this->variant($chair, 'Red')['stock_quantity']]);
        $this->assertSame(135, $chair['price'], 'the product’s own price is its cheapest variant’s');

        $listed = collect($this->client()->get('/api/v1/catalog')->assertOk()->json('products'))->firstWhere('id', $chair['id']);
        $this->assertSame([['name' => 'Colour', 'values' => ['Black', 'Red', 'White']]], $listed['attributes']);
        $white = collect($listed['variants'])->first(fn ($v) => $v['options']['Colour'] === 'White');
        $this->assertSame(['/storage/uploads/2026/10/chair-white.png', 'out_of_stock', 0], [$white['image'], $white['availability'], $white['max_quantity']]);
        $red = collect($listed['variants'])->first(fn ($v) => $v['options']['Colour'] === 'Red');
        $this->assertSame([135, 150, true, 'low_stock'], [$red['price'], $red['regular_price'], $red['on_sale'], $red['availability']]);
    }

    public function test_a_desk_in_three_sizes_can_be_edited_and_a_size_switched_off(): void
    {
        $owner = $this->owner();
        $desk = $owner->post(self::ADMIN, [
            'name' => 'Marvo Gaming Desk', 'status' => 'published', 'type' => 'variable',
            'attributes' => [['name' => 'Dimensions', 'values' => ['120 cm', '140 cm', '160 cm']]],
            'variants' => array_map(fn ($size, $price) => ['options' => ['Dimensions' => $size], 'regular_price' => $price, 'stock_quantity' => 3], ['120 cm', '140 cm', '160 cm'], [120, 140, 160]),
        ])->assertCreated()->json('data');

        $variants = collect($desk['variants'])->map(fn ($v) => ['id' => $v['id'], 'options' => $v['options'], 'regular_price' => $v['regular_price'], 'is_active' => true])->all();
        $variants[1]['regular_price'] = 149; // 140 cm costs more now
        $variants[2]['is_active'] = false;   // 160 cm is no longer sold
        $edited = $owner->put(self::ADMIN."/{$desk['id']}", ['attributes' => $desk['attributes'], 'variants' => $variants])->assertOk()->json('data');

        $this->assertSame([149, false], [collect($edited['variants'])->firstWhere('id', $variants[1]['id'])['price'], collect($edited['variants'])->firstWhere('id', $variants[2]['id'])['is_active']]);
        $this->assertSame(3, collect($edited['variants'])->firstWhere('id', $variants[0]['id'])['stock_quantity'], 'stock untouched when not sent');
        $listed = collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $desk['id']);
        $this->assertSame(['120 cm', '140 cm'], collect($listed['variants'])->pluck('options.Dimensions')->all(), 'a switched-off size isn’t offered');
    }

    public function test_the_server_prices_each_variant_and_refuses_what_cannot_be_bought(): void
    {
        $chair = $this->chair($this->owner());
        $red = $this->variant($chair, 'Red');
        $white = $this->variant($chair, 'White');
        $other = Product::factory()->create();

        $q = $this->client()->post('/api/v1/cart/quote', ['items' => [
            ['product_id' => $chair['id'], 'variant_id' => $red['id'], 'quantity' => 1, 'unit_price' => 0.01],
            ['product_id' => $chair['id'], 'quantity' => 1],                                   // no colour chosen
            ['product_id' => $chair['id'], 'variant_id' => $white['id'], 'quantity' => 1],     // sold out
            ['product_id' => $other->id, 'variant_id' => $red['id'], 'quantity' => 1],          // another product's variant: refused
        ]])->assertOk()->json('data');

        $lines = collect($q['lines']);
        $line = $lines->first(fn ($l) => $l['variant_id'] === $red['id'] && $l['product_id'] === $chair['id']);
        $this->assertSame([135, 150, [['name' => 'Colour', 'value' => 'Red']]], [$line['unit_price'], $line['regular_price'], $line['options']]);
        $this->assertSame('OPTIONS_REQUIRED', $lines->first(fn ($l) => $l['product_id'] === $chair['id'] && $l['variant_id'] === null)['code']);
        $this->assertSame('SOLD_OUT', $lines->first(fn ($l) => $l['variant_id'] === $white['id'])['code']);
        $this->assertSame('UNAVAILABLE', $lines->first(fn ($l) => $l['product_id'] === $other->id)['code']);
        $this->assertSame(135, $q['subtotal'], 'only what can be bought counts');

        $this->client()->post('/api/v1/cart/quote', ['items' => [['product_id' => $chair['id'], 'variant_id' => $red['id'], 'quantity' => 2]]])
            ->assertOk()->assertJsonPath('data.lines.0.code', 'LOW_STOCK')->assertJsonPath('data.lines.0.max_quantity', 1);
    }

    public function test_an_order_keeps_the_variant_takes_its_stock_and_a_cancellation_returns_it_once(): void
    {
        $owner = $this->owner();
        $chair = $this->chair($owner);
        $black = $this->variant($chair, 'Black');

        $r = $this->client()->post('/api/v1/orders', $this->order([['product_id' => $chair['id'], 'variant_id' => $black['id'], 'quantity' => 3]]))->assertCreated();
        $id = $r->json('data.id');
        $r->assertJsonPath('data.items.0.options', [['name' => 'Colour', 'value' => 'Black']])->assertJsonPath('data.items.0.unit_price', 150)->assertJsonPath('data.items.0.sku', 'MV-CH-BK');
        $this->assertSame([1, 3], [ProductVariant::find($black['id'])->stock_quantity, (int) OrderItem::where('order_id', $id)->value('stock_held')]);
        $this->assertSame($black['id'], OrderItem::where('order_id', $id)->value('variant_id'));
        $owner->get("/api/v1/admin/orders/{$id}")->assertOk()->assertJsonPath('data.items.0.options.0.value', 'Black');

        // Only one black chair left: a second order for two is refused, nothing taken.
        $this->client()->post('/api/v1/orders', $this->order([['product_id' => $chair['id'], 'variant_id' => $black['id'], 'quantity' => 2]]))->assertStatus(409);
        $this->assertSame(1, ProductVariant::find($black['id'])->stock_quantity);

        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'cancelled'])->assertOk();
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'cancelled'])->assertOk(); // again: nothing more
        $this->assertSame(4, ProductVariant::find($black['id'])->stock_quantity);
        $this->assertSame([-3, 3], InventoryMovement::where('order_id', $id)->orderBy('id')->pluck('quantity_change')->all());
        $this->assertSame([$black['id'], $black['id']], InventoryMovement::where('order_id', $id)->pluck('variant_id')->all());

        // The product changes later; the order still says what was bought.
        $owner->put(self::ADMIN."/{$chair['id']}", ['name' => 'Megavolt Chair Pro']);
        $this->assertSame([['name' => 'Colour', 'value' => 'Black']], Order::find($id)->items->first()->variant_options);
    }

    public function test_variant_stock_is_counted_from_the_inventory_screen(): void
    {
        $owner = $this->owner();
        $chair = $this->chair($owner);
        $red = $this->variant($chair, 'Red');

        $owner->put("/api/v1/admin/inventory/variants/{$red['id']}", ['stock_quantity' => 6, 'note' => 'Stocktake'])->assertOk()
            ->assertJsonPath('data.variants.1.stock_quantity', 6);
        $owner->put("/api/v1/admin/inventory/variants/{$red['id']}", ['adjust' => -2])->assertOk();
        $this->assertSame(4, ProductVariant::find($red['id'])->stock_quantity);
        $this->assertSame([5, -2], InventoryMovement::where('variant_id', $red['id'])->whereNull('order_id')->orderBy('id')->skip(1)->take(2)->pluck('quantity_change')->all(), 'stocktake and adjustment are in the history');
        $this->assertSame(4 + 4 + 0, Product::find($chair['id'])->stock_quantity, 'the product’s stock is its variants’ total (black, red, white)');

        $owner->put("/api/v1/admin/inventory/variants/{$red['id']}", ['stock_quantity' => 1, 'adjust' => 1])->assertStatus(422);
        $owner->put("/api/v1/admin/inventory/{$chair['id']}", ['stock_quantity' => 9])->assertStatus(409)->assertJsonPath('error.code', 'HAS_VARIANTS');
        $this->client()->put("/api/v1/admin/inventory/variants/{$red['id']}", ['stock_quantity' => 50])->assertStatus(401);
    }
}
