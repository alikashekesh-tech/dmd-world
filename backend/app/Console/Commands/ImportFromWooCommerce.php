<?php

namespace App\Console\Commands;

use App\Services\Import\ProductImporter;
use App\Services\Import\TaxonomyImporter;
use App\Services\Import\WooCommerceSource;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * One-time migration from the old WooCommerce store into MySQL (read-only on the store's side).
 *
 *   php artisan dmd:import                     everything, in dependency order
 *   php artisan dmd:import --only=taxonomy     just categories and brands
 *
 * Each part runs in its own transaction and updates the same rows when run again (WooCommerce ids are kept).
 * After go-live MySQL is the source of truth, so the command refuses to run in production without --force.
 */
class ImportFromWooCommerce extends Command
{
    protected $signature = 'dmd:import
        {--only=* : Limit to some parts: taxonomy, products}
        {--force : Allow running with APP_ENV=production (only before go-live)}';

    protected $description = 'Import the old WooCommerce store into MySQL (categories, brands, …), keeping legacy ids';

    public const PARTS = ['taxonomy', 'products'];

    public function handle(): int
    {
        if ($this->laravel->isProduction() && ! $this->option('force')) {
            $this->error('This is production: after go-live MySQL is the source of truth. Pass --force only for the go-live import.');

            return self::FAILURE;
        }
        $only = $this->option('only') ?: self::PARTS;
        if ($unknown = array_diff($only, self::PARTS)) {
            $this->error('Unknown part(s): '.implode(', ', $unknown).'. Choose from: '.implode(', ', self::PARTS).'.');

            return self::FAILURE;
        }

        try {
            $source = WooCommerceSource::fromConfig();
            foreach (self::PARTS as $part) {
                if (in_array($part, $only, true)) {
                    $this->line("Importing {$part}…");
                    $stats = DB::transaction(fn () => $this->{$part}($source));
                    $this->info('  '.collect($stats)->map(fn ($n, $k) => "{$n} {$k}")->implode(', '));
                }
            }
        } catch (Throwable $e) {
            $this->error('Import stopped: '.$e->getMessage().' (nothing from the failed part was saved)');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function products(WooCommerceSource $source): array
    {
        $importer = app(ProductImporter::class);
        $stats = $importer->import($source->all('/products', ['status' => 'any']));
        foreach ($importer->warnings as $warning) {
            $this->warn("  {$warning}");
        }

        return $stats;
    }

    private function taxonomy(WooCommerceSource $source): array
    {
        return (new TaxonomyImporter)->import($source->all('/products/categories'), require database_path('import/storefront-taxonomy.php'));
    }
}
