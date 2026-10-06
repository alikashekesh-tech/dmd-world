<?php

namespace Tests\Feature\Catalog;

use App\Models\Product;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PricingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_sale_applies_only_inside_its_dates(): void
    {
        $future = Product::factory()->create(['regular_price' => '40.00', 'sale_price' => '30.00', 'sale_starts_at' => now()->addDay()]);
        $active = Product::factory()->create(['regular_price' => '40.00', 'sale_price' => '30.00', 'sale_starts_at' => now()->subDay(), 'sale_ends_at' => now()->addDay()]);
        $ended = Product::factory()->create(['regular_price' => '40.00', 'sale_price' => '30.00', 'sale_ends_at' => now()->subMinute()]);

        $this->assertSame([4000, false], [Pricing::forProduct($future)['price'], Pricing::forProduct($future)['on_sale']]);
        $this->assertSame([3000, true], [Pricing::forProduct($active)['price'], Pricing::forProduct($active)['on_sale']]);
        $this->assertSame(4000, Pricing::forProduct($ended)['price']);

        // The SQL used for price filters and sorting agrees with Pricing.
        $this->assertSame([$active->id], array_column($this->client()->get('/api/v1/products?max_price=35')->json('data'), 'id'));
        $this->client()->get("/api/v1/products/{$active->id}")->assertJsonPath('data.discount_percent', 25)
            ->assertJsonPath('data.sale_ends_at', $active->sale_ends_at->toIso8601String());

        $this->travel(2)->days();
        $this->assertSame(4000, Pricing::forProduct($active->fresh())['price'], 'the sale ends by itself');
    }

    public function test_money_is_exact_in_cents(): void
    {
        $this->assertSame(1999, Money::cents('19.99'));
        $this->assertSame(1999, Money::cents(19.99));
        $this->assertSame(1050, Money::cents('10.5'));
        $this->assertSame('19.99', Money::decimal(1999));
        $this->assertSame('0.05', Money::decimal(5));
        $this->assertSame(30, Money::json(3000));
        $this->assertSame(19.99, Money::json(1999));
        $this->assertSame(30000, array_sum(array_fill(0, 3, Money::cents('100.00'))));
    }
}
