<?php

namespace Database\Factories;

use App\Models\Brand;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Brand> */
class BrandFactory extends Factory
{
    public function definition(): array
    {
        $name = Str::title(fake()->unique()->word()).' Gear';

        return ['name' => $name, 'slug' => Str::slug($name), 'is_active' => true, 'position' => 0];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
