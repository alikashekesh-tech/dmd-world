<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Product> */
class ProductFactory extends Factory
{
    public function definition(): array
    {
        $name = Str::title(fake()->unique()->words(3, true));

        return [
            'name' => $name,
            'slug' => Str::slug($name),
            'sku' => strtoupper(Str::random(8)),
            'regular_price' => '25.00',
            'status' => 'published',
            'published_at' => now()->subDay(),
            'track_stock' => true,
            'stock_quantity' => 10,
            'stock_status' => 'in_stock',
        ];
    }

    public function draft(): static
    {
        return $this->state(fn () => ['status' => 'draft', 'published_at' => null]);
    }

    public function stock(int $quantity): static
    {
        return $this->state(fn () => ['stock_quantity' => $quantity]);
    }

    public function onSale(string $price): static
    {
        return $this->state(fn () => ['sale_price' => $price]);
    }
}
