<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Test and development buyers only. Their password is DEFAULT_PASSWORD, which meets the password policy.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    public const DEFAULT_PASSWORD = 'Buyer-Pass-42!';

    protected static ?string $password;

    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => User::normalizeEmail(fake()->unique()->safeEmail()),
            'phone' => '+961 70 '.fake()->numerify('### ###'),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make(self::DEFAULT_PASSWORD),
            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn () => ['email_verified_at' => null]);
    }

    /** A customer imported from the old store who hasn't chosen a password yet. */
    public function withoutPassword(): static
    {
        return $this->state(fn () => ['password' => null]);
    }
}
