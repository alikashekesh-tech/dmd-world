<?php

use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

/*
| Storefront and buyer API, served at /api/v1 (see bootstrap/app.php).
| Feature routes are added phase by phase: docs/laravel-migration.md.
*/

// No session and no rate-limit counter (both live in MySQL), so an outage is reported as a clean 503.
Route::get('/health', HealthController::class)
    ->withoutMiddleware([EnsureFrontendRequestsAreStateful::class, 'throttle:api'])
    ->name('health');
