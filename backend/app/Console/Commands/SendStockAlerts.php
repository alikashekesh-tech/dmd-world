<?php

namespace App\Console\Commands;

use App\Models\StockAlert;
use App\Services\StockAlerts;
use Illuminate\Console\Command;

/**
 * Back-in-stock emails are sent the moment a product comes back. This scheduled run is the safety net: it sends any
 * that a failed email left behind, and forgets alerts that were answered more than 90 days ago.
 */
class SendStockAlerts extends Command
{
    protected $signature = 'dmd:stock-alerts';

    protected $description = 'Send back-in-stock emails still waiting, and prune old answered alerts';

    public function handle(StockAlerts $alerts): int
    {
        $sent = $alerts->sendAll();
        $pruned = StockAlert::whereNotNull('notified_at')->where('notified_at', '<', now()->subDays(90))->delete();
        $this->info("Sent {$sent} back-in-stock email(s); pruned {$pruned} old alert(s).");

        return self::SUCCESS;
    }
}
