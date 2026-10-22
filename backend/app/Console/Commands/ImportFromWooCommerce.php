<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\Import\CouponImporter;
use App\Services\Import\CustomerImporter;
use App\Services\Import\OrderImporter;
use App\Services\Import\OrderNoteImporter;
use App\Services\Import\ProductImporter;
use App\Services\Import\ReviewImporter;
use App\Services\Import\SettingsImporter;
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
        {--only=* : Limit to some parts: settings, taxonomy, products, customers, orders, reviews, notes, coupons}
        {--force : Allow running with APP_ENV=production (only before go-live)}';

    protected $description = 'Import the old WooCommerce store into MySQL (categories, brands, …), keeping legacy ids';

    public const PARTS = ['settings', 'taxonomy', 'products', 'customers', 'orders', 'reviews', 'notes', 'coupons'];

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

    private function customers(WooCommerceSource $source): array
    {
        return $this->report(new CustomerImporter, fn ($i) => $i->import($source->all('/customers', ['role' => 'all'])));
    }

    private function orders(WooCommerceSource $source): array
    {
        return $this->report(new OrderImporter, fn ($i) => $i->import($source->all('/orders', ['status' => 'any'])));
    }

    private function reviews(WooCommerceSource $source): array
    {
        return $this->report(new ReviewImporter, fn ($i) => $i->import($source->all('/products/reviews', ['status' => 'all'])));
    }

    /** Order notes: one request per imported order (WooCommerce has no bulk endpoint for them). */
    private function notes(WooCommerceSource $source): array
    {
        $ids = array_column($source->all('/orders', ['status' => 'any', '_fields' => 'id']), 'id');
        $imported = Order::whereIn('id', $ids)->pluck('id');
        $notes = [];
        foreach ($imported as $id) {
            $notes[$id] = $source->all("/orders/{$id}/notes", ['type' => 'any']);
        }

        return $this->report(new OrderNoteImporter, fn ($i) => $i->import($notes));
    }

    private function coupons(WooCommerceSource $source): array
    {
        return $this->report(new CouponImporter, fn ($i) => $i->import([...$source->all('/coupons'), ...$source->all('/coupons', ['status' => 'trash'])]));
    }

    private function settings(WooCommerceSource $source): array
    {
        return (new SettingsImporter)->import(['general' => $source->all('/settings/general'), 'products' => $source->all('/settings/products')]);
    }

    private function report(object $importer, callable $run): array
    {
        $stats = $run($importer);
        foreach (array_slice($importer->warnings, 0, 50) as $warning) {
            $this->warn("  {$warning}");
        }

        return $stats;
    }

    private function taxonomy(WooCommerceSource $source): array
    {
        return (new TaxonomyImporter)->import($source->all('/products/categories'), require database_path('import/storefront-taxonomy.php'));
    }
}
