<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Back-in-stock emails normally go the moment a product returns; this retries any that failed (needs `schedule:run`).
Schedule::command('dmd:stock-alerts')->everyTenMinutes()->withoutOverlapping();

// Checkout reminders for customers who asked for one, after the delay the owner set in Settings (off by default).
Schedule::command('dmd:checkout-reminders')->everyTenMinutes()->withoutOverlapping();
