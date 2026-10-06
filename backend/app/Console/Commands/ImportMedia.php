<?php

namespace App\Console\Commands;

use App\Services\Import\MediaImporter;
use Illuminate\Console\Command;

/**
 * Go-live step, after `dmd:import` and `dmd:verify-import`: copies the images the old WordPress site still serves
 * into Laravel's storage so the old site can be switched off. Downloads only from the old store's host
 * (IMPORT_WOO_URL, plus IMPORT_MEDIA_HOSTS). `--dry-run` lists how many addresses would be copied.
 */
class ImportMedia extends Command
{
    protected $signature = 'dmd:import-media {--dry-run : Count the images still served by the old store, change nothing}';

    protected $description = 'Copy images still served by the old WordPress store into Laravel storage';

    public function handle(): int
    {
        $hosts = config('dmd.import.media_hosts');
        if (! $hosts) {
            $this->error('Set IMPORT_WOO_URL (or IMPORT_MEDIA_HOSTS) in backend/.env first: images are only copied from the old store.');

            return self::FAILURE;
        }
        $importer = new MediaImporter($hosts);
        $stats = $importer->import((bool) $this->option('dry-run'));
        $this->info(collect($stats)->map(fn ($n, $k) => "{$n} {$k}")->implode(', ').' (hosts: '.implode(', ', $hosts).')');
        foreach (array_slice($importer->warnings, 0, 50) as $warning) {
            $this->warn("  {$warning}");
        }

        return $stats['failed'] ? self::FAILURE : self::SUCCESS;
    }
}
