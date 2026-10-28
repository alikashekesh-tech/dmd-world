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
use Closure;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * One-time migration from the old WooCommerce store into MySQL (read-only on the store's side).
 *
 *   php artisan dmd:import                     everything, in dependency order
 *   php artisan dmd:import --only=taxonomy     just categories and brands
 *   php artisan dmd:import --fixtures          import from local test fixtures
 *
 * Each part runs in its own transaction and updates the same rows when run again (WooCommerce ids are kept).
 * After go-live MySQL is the source of truth, so the command refuses to run in production without --force.
 */
class ImportFromWooCommerce extends Command
{
    protected $signature = 'dmd:import
        {--only=* : Limit to some parts: settings, taxonomy, products, customers, orders, reviews, notes, coupons}
        {--fixtures : Load from tests/Fixtures/woocommerce instead of remote store}
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

        if ($this->option('fixtures')) {
            config(['dmd.import.woocommerce' => ['url' => 'https://fixtures.local', 'key' => 'ck_test', 'secret' => 'cs_test']]);
            $base = 'fixtures.local/wp-json/wc/v3/';
            $fixture = fn (string $name) => json_decode(file_get_contents(base_path("tests/Fixtures/woocommerce/{$name}.json")), true);
            $list = fn (string $name) => Http::response($fixture($name), 200, ['X-WP-TotalPages' => '1']);
            $settings = $fixture('settings');
            $coupons = collect($fixture('coupons'));
            $notes = $fixture('order-notes');

            Http::fake([
                $base.'products/categories*' => $list('categories'),
                $base.'products/reviews*' => $list('reviews'),
                $base.'products*' => $list('products'),
                $base.'customers*' => $list('customers'),
                $base.'orders/*/notes*' => fn ($r) => Http::response($notes[Str::between($r->url(), '/orders/', '/notes')] ?? []),
                $base.'orders*' => $list('orders'),
                $base.'coupons*' => fn ($r) => Http::response(str_contains($r->url(), 'status=trash')
                    ? $coupons->where('status', 'trash')->values()->all()
                    : $coupons->where('status', '!=', 'trash')->values()->all(), 200, ['X-WP-TotalPages' => '1']),
                $base.'settings/*' => fn ($r) => Http::response($settings[Str::afterLast(Str::before($r->url(), '?'), '/')] ?? [], 200),
            ]);
        }

        try {
            $source = WooCommerceSource::fromConfig();
            foreach (self::PARTS as $part) {
                if (in_array($part, $only, true)) {
                    $this->line("Importing {$part}…");
                    // Read the old store first (minutes for products and orders), then write in one short transaction:
                    // a transaction left open during the downloads loses its MySQL connection on shared hosting.
                    $write = $this->{$part}($source);
                    DB::reconnect();
                    $stats = DB::transaction($write);
                    $this->info('  '.collect($stats)->map(fn ($n, $k) => "{$n} {$k}")->implode(', '));
                }
            }
        } catch (Throwable $e) {
            $this->error('Import stopped: '.$e->getMessage().' (nothing from the failed part was saved)');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /* Each part reads the old store now and returns the writes, which handle() runs inside a transaction. */

    private function products(WooCommerceSource $source): Closure
    {
        $products = $source->all('/products', ['status' => 'any']);

        return function () use ($products) {
            $importer = app(ProductImporter::class);
            $stats = $importer->import($products);
            foreach ($importer->warnings as $warning) {
                $this->warn("  {$warning}");
            }

            return $stats;
        };
    }

    private function customers(WooCommerceSource $source): Closure
    {
        $customers = $source->all('/customers', ['role' => 'all']);

        return fn () => $this->report(new CustomerImporter, fn ($i) => $i->import($customers));
    }

    private function orders(WooCommerceSource $source): Closure
    {
        $orders = $source->all('/orders', ['status' => 'any']);

        return fn () => $this->report(new OrderImporter, fn ($i) => $i->import($orders));
    }

    private function reviews(WooCommerceSource $source): Closure
    {
        $reviews = $source->all('/products/reviews', ['status' => 'all']);

        return fn () => $this->report(new ReviewImporter, fn ($i) => $i->import($reviews));
    }

    /** Order notes: one request per imported order (WooCommerce has no bulk endpoint for them). */
    private function notes(WooCommerceSource $source): Closure
    {
        $ids = array_column($source->all('/orders', ['status' => 'any', '_fields' => 'id']), 'id');
        $imported = Order::whereIn('id', $ids)->pluck('id');
        $notes = [];
        foreach ($imported as $id) {
            $notes[$id] = $source->all("/orders/{$id}/notes", ['type' => 'any']);
        }

        return fn () => $this->report(new OrderNoteImporter, fn ($i) => $i->import($notes));
    }

    private function coupons(WooCommerceSource $source): Closure
    {
        $coupons = [...$source->all('/coupons'), ...$source->all('/coupons', ['status' => 'trash'])];

        return fn () => $this->report(new CouponImporter, fn ($i) => $i->import($coupons));
    }

    private function settings(WooCommerceSource $source): Closure
    {
        $settings = ['general' => $source->all('/settings/general'), 'products' => $source->all('/settings/products')];

        return fn () => (new SettingsImporter)->import($settings);
    }

    private function report(object $importer, callable $run): array
    {
        $stats = $run($importer);
        foreach (array_slice($importer->warnings, 0, 50) as $warning) {
            $this->warn("  {$warning}");
        }

        return $stats;
    }

    private function taxonomy(WooCommerceSource $source): Closure
    {
        $categories = $source->all('/products/categories');

        return fn () => (new TaxonomyImporter)->import($categories, require database_path('import/storefront-taxonomy.php'));
    }
}
