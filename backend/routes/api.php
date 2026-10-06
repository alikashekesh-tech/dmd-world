<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\BrandController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\ProductController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

/*
| Storefront and buyer API, served at /api/v1 (see bootstrap/app.php). The owner's API is routes/admin.php.
| Buyer-owned data is always looked up from the signed-in session, never from an id sent by the browser.
*/

// No session and no rate-limit counter (both live in MySQL), so an outage is reported as a clean 503.
Route::get('/health', HealthController::class)
    ->withoutMiddleware([EnsureFrontendRequestsAreStateful::class, 'throttle:api'])
    ->name('health');

/* ── buyer accounts ─────────────────────────────────────────────────── */
Route::prefix('auth')->name('auth.')->middleware('session')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register')->name('register');
    Route::post('login', [AuthController::class, 'login'])->name('login');
    Route::post('logout', [AuthController::class, 'logout'])->name('logout');
    Route::post('forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:password-email')->name('forgot');
    Route::post('reset-password', [PasswordController::class, 'reset'])->middleware('throttle:password-reset')->name('reset');
    Route::post('reset-password/check', [PasswordController::class, 'check'])->middleware('throttle:password-reset')->name('reset.check');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me'])->name('me');
        Route::put('password', [PasswordController::class, 'update'])->name('password');
    });
});

/* ── catalog: what the storefront shows ─────────────────────────────── */
Route::get('catalog', [ProductController::class, 'catalog'])->name('catalog');
Route::get('products', [ProductController::class, 'index'])->name('products.index');
Route::get('products/{id}', [ProductController::class, 'show'])->whereNumber('id')->name('products.show');
Route::get('categories', [CategoryController::class, 'index'])->name('categories.index');
Route::get('categories/lookup', [CategoryController::class, 'lookup'])->name('categories.lookup');
Route::get('categories/{id}', [CategoryController::class, 'show'])->whereNumber('id')->name('categories.show');
Route::get('brands', [BrandController::class, 'index'])->name('brands.index');
Route::get('brands/{slug}', [BrandController::class, 'show'])->where('slug', '[a-z0-9-]+')->name('brands.show');
