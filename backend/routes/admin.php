<?php

use App\Http\Controllers\Api\V1\Admin\AuthController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController;
use App\Http\Controllers\Api\V1\Admin\ConversationController;
use App\Http\Controllers\Api\V1\Admin\CustomerController;
use App\Http\Controllers\Api\V1\Admin\InventoryController;
use App\Http\Controllers\Api\V1\Admin\OrderController;
use App\Http\Controllers\Api\V1\Admin\ProductController;
use App\Http\Controllers\Api\V1\Admin\ReviewController;
use App\Http\Controllers\Api\V1\Admin\StockAlertController;
use App\Http\Controllers\Api\V1\Admin\UploadController;
use Illuminate\Support\Facades\Route;

/*
| The owner's API, served at /api/v1/admin (see bootstrap/app.php). Everything except signing in requires the
| `admin` guard: a buyer's session is never accepted here, whatever the buyer sends.
| `auth.session` signs out other devices as soon as the owner's password changes.
*/

Route::middleware('session')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
});

Route::middleware(['auth:admin', 'auth.session'])->group(function () {
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::put('auth/password', [AuthController::class, 'password'])->name('auth.password');

    // Catalog. DELETE archives; /restore brings back; /permanent removes an archived record that nothing uses.
    $resources = [
        'categories' => [CategoryController::class, 'category'],
        'brands' => [BrandController::class, 'brand'],
        'products' => [ProductController::class, 'product'],
    ];
    foreach ($resources as $name => [$controller, $param]) {
        Route::post("{$name}/{id}/restore", [$controller, 'restore'])->whereNumber('id')->name("{$name}.restore");
        Route::delete("{$name}/{id}/permanent", [$controller, 'forceDestroy'])->whereNumber('id')->name("{$name}.force-destroy");
        Route::apiResource($name, $controller)->parameters([$name => $param])->whereNumber($param);
    }
    Route::post('categories/reorder', [CategoryController::class, 'reorder'])->name('categories.reorder');
    Route::post('brands/reorder', [BrandController::class, 'reorder'])->name('brands.reorder');
    Route::post('products/bulk', [ProductController::class, 'bulk'])->name('products.bulk');

    // Stock: levels, stocktakes and adjustments, history.
    Route::get('inventory', [InventoryController::class, 'index'])->name('inventory.index');
    Route::put('inventory/{product}', [InventoryController::class, 'update'])->whereNumber('product')->name('inventory.update');
    Route::get('inventory/{product}/movements', [InventoryController::class, 'movements'])->whereNumber('product')->name('inventory.movements');

    Route::post('uploads', [UploadController::class, 'store'])->name('uploads.store');

    // Orders: every order in the store; status changes go through OrderService (stock follows cancellations).
    Route::get('orders', [OrderController::class, 'index'])->name('orders.index');
    Route::get('orders/{order}', [OrderController::class, 'show'])->whereNumber('order')->name('orders.show');
    Route::put('orders/{order}/status', [OrderController::class, 'status'])->whereNumber('order')->name('orders.status');
    Route::put('orders/{order}/payment', [OrderController::class, 'payment'])->whereNumber('order')->name('orders.payment');
    Route::post('orders/{order}/notes', [OrderController::class, 'note'])->whereNumber('order')->name('orders.notes');

    // Customers: registered buyers and guests, with what they ordered.
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('customers/{user}', [CustomerController::class, 'show'])->whereNumber('user')->name('customers.show');
    Route::put('customers/{user}', [CustomerController::class, 'update'])->whereNumber('user')->name('customers.update');

    // Reviews: moderation. Only approved reviews reach the storefront and its ratings.
    Route::get('reviews', [ReviewController::class, 'index'])->name('reviews.index');
    Route::get('reviews/{review}', [ReviewController::class, 'show'])->whereNumber('review')->name('reviews.show');
    Route::put('reviews/{review}', [ReviewController::class, 'update'])->whereNumber('review')->name('reviews.update');
    Route::delete('reviews/{review}', [ReviewController::class, 'destroy'])->whereNumber('review')->name('reviews.destroy');

    // Conversations with buyers; replies are emailed to the buyer.
    Route::get('conversations', [ConversationController::class, 'index'])->name('conversations.index');
    Route::post('conversations', [ConversationController::class, 'store'])->name('conversations.store');
    Route::get('conversations/{conversation}', [ConversationController::class, 'show'])->whereNumber('conversation')->name('conversations.show');
    Route::post('conversations/{conversation}/messages', [ConversationController::class, 'reply'])->whereNumber('conversation')->name('conversations.reply');
    Route::post('conversations/{conversation}/unread', [ConversationController::class, 'unread'])->whereNumber('conversation')->name('conversations.unread');

    Route::get('stock-alerts', [StockAlertController::class, 'index'])->name('stock-alerts.index');
});
