<?php

namespace App\Console\Commands;

use App\Services\Import\ImportVerifier;
use App\Services\Import\WooCommerceSource;
use Illuminate\Console\Command;
use Throwable;

/**
 * After `dmd:import`, before switching the old store off: reads the old store again (GET only) and checks every
 * imported product, customer, order, review and coupon against MySQL. Fails when anything is missing or differs
 * in a way the new system didn't cause itself.
 */
class VerifyImport extends Command
{
    protected $signature = 'dmd:verify-import';

    protected $description = 'Check every record of the old WooCommerce store against MySQL (read-only)';

    public function handle(ImportVerifier $verifier): int
    {
        try {
            $woo = WooCommerceSource::fromConfig();
            $report = $verifier->verify([
                'products' => $woo->all('/products', ['status' => 'any']),
                'customers' => $woo->all('/customers', ['role' => 'all']),
                'orders' => $woo->all('/orders', ['status' => 'any']),
                'reviews' => $woo->all('/products/reviews', ['status' => 'all']),
                'coupons' => [...$woo->all('/coupons'), ...$woo->all('/coupons', ['status' => 'trash'])],
            ]);
        } catch (Throwable $e) {
            $this->error('Could not read the old store: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->table(['Records', 'Old store', 'In MySQL', 'Identical', 'Changed since in the new admin', 'Missing', 'Different'], collect($report)->map(fn ($r, $k) => [
            $k, $r['source'], $r['found'], $r['matched'], $r['changed_since'], count($r['missing']), count($r['mismatched']),
        ])->values()->all());
        $problems = collect($report)->flatMap(fn ($r) => [...$r['missing'], ...$r['mismatched']]);
        foreach ($problems->take(50) as $line) {
            $this->warn("  {$line}");
        }
        if ($problems->isNotEmpty()) {
            $this->error("{$problems->count()} record(s) need attention before the old store is switched off.");

            return self::FAILURE;
        }
        $this->info('Every record of the old store is in MySQL.');

        return self::SUCCESS;
    }
}
