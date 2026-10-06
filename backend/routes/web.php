<?php

use Illuminate\Support\Facades\Route;

// This application is the DMD World API. The storefront and the admin are the React apps at the project root.
Route::get('/', fn () => response()->json(['name' => config('app.name'), 'api' => url('/api/v1')]));
