<?php

namespace Tests\Feature\Orders;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Stock per variant, as the product page shows it and as checkout enforces it: "Only X left" from the owner's
 * low-stock threshold (a product's own threshold first), no number for untracked stock, and an order can never take
 * more than a variant has, never a sold-out one, and never leaves stock below zero.
 */
class VariantStockCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private array $product;

    private array $v = [];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        StoreSettings::put(['low_stock_threshold' => 4]);
        $this->product = $this->owner()->post('/api/v1/admin/products', [
            'name' => 'MEGAVOLT CONTROLLER CALL OF DUTY', 'status' => 'published', 'type' => 'variable',
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'White', 'Red', 'Blue']]],
            'variants' => [
                ['options' => ['Colour' => 'Black'], 'sku' => 'MV-CTL-BK', 'regular_price' => 14, 'sale_price' => 12, 'stock_quantity' => 7],
                ['options' => ['Colour' => 'White'], 'sku' => 'MV-CTL-WH', 'regular_price' => 15, 'stock_quantity' => 3],
                ['options' => ['Colour' => 'Red'], 'sku' => 'MV-CTL-RD', 'regular_price' => 13, 'stock_quantity' => 0],
                ['options' => ['Colour' => 'Blue'], 'sku' => 'MV-CTL-BL', 'regular_price' => 13, 'track_stock' => false, 'stock_status' => 'in_stock'],
            ],
        ])->assertCreated()->json('data');
        foreach ($this->product['variants'] as $v) {
            $this->v[$v['options']['Colour']] = $v;
        }
    }

    private function order(array $items)
    {
        return $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => $items,
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ]);
    }

    private function line(string $colour, int $qty): array
    {
        return ['product_id' => $this->product['id'], 'variant_id' => $this->v[$colour]['id'], 'quantity' => $qty];
    }

    private function stock(string $colour): int
    {
        return ProductVariant::findOrFail($this->v[$colour]['id'])->stock_quantity;
    }

    /** What the shop says about each variant: [availability, stock_left, max_quantity]. */
    private function shown(): array
    {
        $p = collect($this->client()->get('/api/v1/catalog')->assertOk()->json('products'))->firstWhere('id', $this->product['id']);

        return collect($p['variants'])->mapWithKeys(fn ($v) => [$v['options']['Colour'] => [$v['availability'], $v['stock_left'], $v['max_quantity']]])->all();
    }

    public function test_each_variant_shows_its_own_stock_with_the_owners_threshold(): void
    {
        $this->assertSame([
            'Black' => ['in_stock', null, 7],       // "In stock": no number when stock isn't low
            'White' => ['low_stock', 3, 3],         // "Only 3 left": 3 is at or under the store's threshold of 4
            'Red' => ['out_of_stock', null, 0],     // "Out of stock"
            'Blue' => ['in_stock', null, null],     // not tracked: no number and no stock limit, ever
        ], $this->shown());

        // A product's own threshold comes first; the store setting is left as the owner set it.
        $this->owner()->put("/api/v1/admin/products/{$this->product['id']}", ['low_stock_threshold' => 8])->assertOk();
        $this->assertSame(['low_stock', 7, 7], $this->shown()['Black']);
        $this->assertSame(4, StoreSettings::lowStockThreshold());
    }

    public function test_checkout_never_sells_more_than_a_variant_has(): void
    {
        $this->order([$this->line('Black', 8)])->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        // The same variant on two lines counts together (what's already in the cart).
        $this->order([$this->line('Black', 4), $this->line('Black', 4)])->assertStatus(409)->assertJsonPath('error.code', 'LOW_STOCK');
        $this->order([$this->line('Red', 1)])->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
        $this->assertSame([7, 0, 0], [$this->stock('Black'), $this->stock('Red'), Order::count()], 'nothing taken, no order');

        $placed = $this->order([$this->line('Black', 7)])->assertCreated();
        $placed->assertJsonPath('data.items.0.unit_price', 12)->assertJsonPath('data.items.0.options', [['name' => 'Colour', 'value' => 'Black']])
            ->assertJsonPath('data.items.0.sku', 'MV-CTL-BK');
        $this->assertSame([0, $this->v['Black']['id']], [$this->stock('Black'), OrderItem::sole()->variant_id], 'down to exactly zero; the line keeps its variant');

        $this->order([$this->line('Black', 1)])->assertStatus(409)->assertJsonPath('error.code', 'SOLD_OUT');
        $this->assertSame(0, $this->stock('Black'), 'never below zero');
        $this->assertSame(['out_of_stock', null, 0], $this->shown()['Black']);
        $this->assertSame([3, 1], [$this->stock('White'), Order::count()], 'other variants untouched');
    }

    public function test_untracked_variants_have_no_stock_limit_and_the_quote_reports_the_real_maximum(): void
    {
        $this->order([$this->line('Blue', 40)])->assertCreated();
        $this->assertSame(['in_stock', null, null], $this->shown()['Blue']);

        $q = $this->client()->post('/api/v1/cart/quote', ['items' => [$this->line('White', 5), $this->line('Blue', 2)]])->assertOk()->json('data');
        $lines = collect($q['lines'])->keyBy('variant_id');
        $this->assertSame(['LOW_STOCK', 3], [$lines[$this->v['White']['id']]['code'], $lines[$this->v['White']['id']]['max_quantity']]);
        $this->assertNull($lines[$this->v['Blue']['id']]['code']);
        $this->assertNull($lines[$this->v['Blue']['id']]['max_quantity']);
    }
}
