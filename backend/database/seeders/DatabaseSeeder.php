<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * No business data is seeded: the store's catalog, customers and orders come from the import commands
 * (`php artisan dmd:import …`, see docs/laravel-migration.md), and the owner from `php artisan dmd:owner`.
 * Tests build their own records with factories.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        //
    }
}
