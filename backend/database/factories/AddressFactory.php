<?php

namespace Database\Factories;

use App\Models\Address;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Address> */
class AddressFactory extends Factory
{
    public function definition(): array
    {
        return [
            'label' => 'Home', 'first_name' => fake()->firstName(), 'last_name' => fake()->lastName(), 'phone' => '+961 70 123 456',
            'country' => 'LB', 'city' => 'Beirut', 'area' => 'Hamra', 'street' => 'Bliss Street', 'building' => 'Rose', 'floor' => '3',
        ];
    }
}
