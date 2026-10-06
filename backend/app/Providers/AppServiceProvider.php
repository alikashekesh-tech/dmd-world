<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // The SPA authenticates with Sanctum's session cookie only. Bearer tokens are switched off entirely, so no
        // token can be stolen from JavaScript and there is no token table to look up.
        Sanctum::getAccessTokenFromRequestUsing(fn () => null);

        TrustProxies::at(config('dmd.trusted_proxies'));

        // A general ceiling per signed-in account (or address); sign-in, sign-up and checkout get tighter limits.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by($request->user()?->getAuthIdentifier() ?: $request->ip()));

        // Development catches lazy loading, unknown attributes and mass-assignment mistakes early.
        Model::shouldBeStrict(! $this->app->isProduction());

        // migrate:fresh, db:wipe and friends refuse to run against production.
        DB::prohibitDestructiveCommands($this->app->isProduction());
    }
}
