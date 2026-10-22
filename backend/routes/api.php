<?php

use App\Http\Controllers\Api\V1\Account\AddressController;
use App\Http\Controllers\Api\V1\Account\ConversationController;
use App\Http\Controllers\Api\V1\Account\ProfileController;
use App\Http\Controllers\Api\V1\Account\ReviewController;
use App\Http\Controllers\Api\V1\Account\StockAlertController;
use App\Http\Controllers\Api\V1\Account\WishlistController;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\BrandController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProductReviewController;
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

/* ── the signed-in buyer's own data (never another buyer's: everything is scoped to the session) ── */
Route::middleware('auth:sanctum')->group(function () {
    Route::get('account', [ProfileController::class, 'show'])->name('account.show');
    Route::patch('account', [ProfileController::class, 'update'])->name('account.update');

    Route::get('account/addresses', [AddressController::class, 'index'])->name('addresses.index');
    Route::post('account/addresses', [AddressController::class, 'store'])->name('addresses.store');
    Route::patch('account/addresses/{id}', [AddressController::class, 'update'])->whereNumber('id')->name('addresses.update');
    Route::delete('account/addresses/{id}', [AddressController::class, 'destroy'])->whereNumber('id')->name('addresses.destroy');
    Route::post('account/addresses/{id}/default', [AddressController::class, 'makeDefault'])->whereNumber('id')->name('addresses.default');

    Route::get('wishlist', [WishlistController::class, 'index'])->name('wishlist.index');
    Route::post('wishlist', [WishlistController::class, 'store'])->name('wishlist.store');
    Route::post('wishlist/merge', [WishlistController::class, 'merge'])->name('wishlist.merge');
    Route::delete('wishlist/{productId}', [WishlistController::class, 'destroy'])->whereNumber('productId')->name('wishlist.destroy');

    // Reviews: one per product; new and edited ones wait for the owner.
    Route::get('account/reviews', [ReviewController::class, 'index'])->name('reviews.index');
    Route::post('account/reviews', [ReviewController::class, 'store'])->middleware('throttle:reviews')->name('reviews.store');
    Route::put('account/reviews/{id}', [ReviewController::class, 'update'])->whereNumber('id')->middleware('throttle:reviews')->name('reviews.update');
    Route::delete('account/reviews/{id}', [ReviewController::class, 'destroy'])->whereNumber('id')->name('reviews.destroy');

    // Conversations with the store (one per order, or a general question).
    Route::get('account/conversations', [ConversationController::class, 'index'])->name('conversations.index');
    Route::get('account/conversations/unread', [ConversationController::class, 'unread'])->name('conversations.unread');
    Route::get('account/conversations/{id}', [ConversationController::class, 'show'])->whereNumber('id')->name('conversations.show');
    Route::post('account/conversations', [ConversationController::class, 'store'])->middleware('throttle:messages')->name('conversations.store');
    Route::post('account/conversations/{id}/messages', [ConversationController::class, 'reply'])->whereNumber('id')->middleware('throttle:messages')->name('conversations.reply');

    // Back-in-stock alerts.
    Route::get('account/stock-alerts', [StockAlertController::class, 'index'])->name('stock-alerts.index');
    Route::post('account/stock-alerts', [StockAlertController::class, 'store'])->middleware('throttle:stock-alerts')->name('stock-alerts.store');
    Route::delete('account/stock-alerts/{productId}', [StockAlertController::class, 'destroy'])->whereNumber('productId')->name('stock-alerts.destroy');
});

/* ── cart, checkout and orders (guests too: a guest opens their order with the private token from checkout) ── */
Route::get('checkout/options', [CheckoutController::class, 'options'])->name('checkout.options');
Route::post('cart/quote', [CheckoutController::class, 'quote'])->middleware('throttle:quote')->name('cart.quote');
Route::post('orders', [CheckoutController::class, 'store'])->middleware(['session', 'throttle:orders'])->name('orders.store');
Route::get('orders', [OrderController::class, 'index'])->middleware('auth:sanctum')->name('orders.index');
Route::get('orders/{id}', [OrderController::class, 'show'])->whereNumber('id')->name('orders.show');
Route::post('orders/{id}/cancel', [OrderController::class, 'cancel'])->whereNumber('id')->middleware(['session', 'throttle:cancel'])->name('orders.cancel');

/* ── catalog: what the storefront shows ─────────────────────────────── */
Route::get('catalog', [ProductController::class, 'catalog'])->name('catalog');
Route::get('products', [ProductController::class, 'index'])->name('products.index');
Route::get('products/{id}', [ProductController::class, 'show'])->whereNumber('id')->name('products.show');
Route::get('products/{id}/reviews', [ProductReviewController::class, 'index'])->whereNumber('id')->name('products.reviews');
Route::get('categories', [CategoryController::class, 'index'])->name('categories.index');
Route::get('categories/lookup', [CategoryController::class, 'lookup'])->name('categories.lookup');
Route::get('categories/{id}', [CategoryController::class, 'show'])->whereNumber('id')->name('categories.show');
Route::get('brands', [BrandController::class, 'index'])->name('brands.index');
Route::get('brands/{slug}', [BrandController::class, 'show'])->where('slug', '[a-z0-9-]+')->name('brands.show');
