<?php

use App\Http\Controllers\Api\V1\Admin\AuthController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController;
use App\Http\Controllers\Api\V1\Admin\InventoryController;
use App\Http\Controllers\Api\V1\Admin\ProductController;
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
});
