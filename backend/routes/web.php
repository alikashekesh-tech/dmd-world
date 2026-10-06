<?php

use App\Http\Controllers\SeoController;
use Illuminate\Support\Facades\Route;

// This application is the DMD World API. The storefront and the admin are the React apps at the project root.
Route::get('/', fn () => response()->json(['name' => config('app.name'), 'api' => url('/api/v1')]));

// The storefront's robots.txt and sitemap.xml (Caddy and the Vite dev server send these two paths here). Public files:
// no session, no cookies.
Route::withoutMiddleware('web')->group(function () {
    Route::get('/robots.txt', [SeoController::class, 'robots']);
    Route::get('/sitemap.xml', [SeoController::class, 'sitemap']);
});
