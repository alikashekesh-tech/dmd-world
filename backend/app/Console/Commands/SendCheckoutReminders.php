<?php

namespace App\Console\Commands;

use App\Services\CheckoutRecoveries;
use Illuminate\Console\Command;

/** Sends the reminders due for checkouts customers didn't finish (only those who asked), and erases old details. */
class SendCheckoutReminders extends Command
{
    protected $signature = 'dmd:checkout-reminders';

    protected $description = 'Send due checkout reminders (customers who asked for one) and erase details older than 30 days';

    public function handle(CheckoutRecoveries $recoveries): int
    {
        $sent = $recoveries->sendDue();
        $erased = $recoveries->erase();
        $this->info("Sent {$sent} checkout reminder(s); erased the details of {$erased} old checkout(s).");

        return self::SUCCESS;
    }
}
