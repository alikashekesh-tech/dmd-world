<?php

use App\Http\Controllers\Api\V1\Admin\AuthController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController;
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

    // Categories and brands. DELETE archives; /restore brings back; /permanent removes an unused archived one.
    foreach (['categories' => CategoryController::class, 'brands' => BrandController::class] as $name => $controller) {
        $param = $name === 'categories' ? 'category' : 'brand';
        Route::post("{$name}/reorder", [$controller, 'reorder'])->name("{$name}.reorder");
        Route::post("{$name}/{id}/restore", [$controller, 'restore'])->whereNumber('id')->name("{$name}.restore");
        Route::delete("{$name}/{id}/permanent", [$controller, 'forceDestroy'])->whereNumber('id')->name("{$name}.force-destroy");
        Route::apiResource($name, $controller)->parameters([$name => $param])->whereNumber($param);
    }
});
