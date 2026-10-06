<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Back-in-stock emails normally go the moment a product returns; this retries any that failed (needs `schedule:run`).
Schedule::command('dmd:stock-alerts')->everyTenMinutes()->withoutOverlapping();
