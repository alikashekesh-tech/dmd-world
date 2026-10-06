<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Category> */
class CategoryFactory extends Factory
{
    public function definition(): array
    {
        $name = Str::title(fake()->unique()->words(2, true));

        return ['name' => $name, 'slug' => Str::slug($name), 'is_visible' => true, 'position' => 0];
    }

    public function hidden(): static
    {
        return $this->state(fn () => ['is_visible' => false]);
    }
}
