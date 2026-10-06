<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
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

        $this->rateLimits();

        // Reset links open the storefront's reset page, which posts the new password back to the API.
        ResetPassword::createUrlUsing(fn (User $user, string $token) => config('dmd.frontend_url').'/account/reset?'.http_build_query(['token' => $token, 'email' => $user->email]));

        // Development catches lazy loading, unknown attributes and mass-assignment mistakes early.
        Model::shouldBeStrict(! $this->app->isProduction());

        // migrate:fresh, db:wipe and friends refuse to run against production.
        DB::prohibitDestructiveCommands($this->app->isProduction());
    }

    private function rateLimits(): void
    {
        $tooMany = fn (string $message) => fn (Request $request, array $headers) => response()->json(['error' => ['code' => 'TOO_MANY_REQUESTS', 'message' => $message]], 429, $headers);

        // A general ceiling per signed-in account (or address).
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by($request->user()?->getAuthIdentifier() ?: $request->ip()));

        RateLimiter::for('register', fn (Request $request) => Limit::perHour(8)->by($request->ip())
            ->response($tooMany('Too many sign-ups from this connection. Please try again later.')));

        // Reset emails: per address and per email, so nobody can flood a buyer's inbox.
        RateLimiter::for('password-email', fn (Request $request) => [
            Limit::perHour(10)->by('ip:'.$request->ip())->response($tooMany('Too many reset requests. Please try again later.')),
            Limit::perHour(3)->by('email:'.sha1(User::normalizeEmail($request->input('email'))))->response($tooMany('Too many reset requests for this email. Please try again later.')),
        ]);

        RateLimiter::for('password-reset', fn (Request $request) => Limit::perMinutes(15, 20)->by($request->ip())
            ->response($tooMany('Too many attempts. Please wait a few minutes.')));

        // Checkout: real orders are rare per person, price checks are frequent but cheap.
        RateLimiter::for('orders', fn (Request $request) => [
            Limit::perHour(10)->by('ip:'.$request->ip())->response($tooMany('Too many orders from this connection. Please wait a little and try again.')),
            Limit::perHour(10)->by('user:'.($request->user()?->getAuthIdentifier() ?? 'guest:'.$request->ip()))->response($tooMany('Too many orders from this account. Please wait a little and try again.')),
        ]);
        RateLimiter::for('quote', fn (Request $request) => Limit::perMinutes(10, 120)->by($request->ip()));
        RateLimiter::for('cancel', fn (Request $request) => Limit::perHour(10)->by($request->user()?->getAuthIdentifier() ?: $request->ip())
            ->response($tooMany('Too many requests. Please wait a little.')));

        // Things buyers write for others to read: generous for people, tight for scripts.
        RateLimiter::for('reviews', fn (Request $request) => Limit::perHour(10)->by('user:'.$request->user()?->getAuthIdentifier())
            ->response($tooMany('You’ve sent a lot of reviews in a short time. Please try again later.')));
        RateLimiter::for('messages', fn (Request $request) => [
            Limit::perMinute(6)->by('burst:'.$request->user()?->getAuthIdentifier())->response($tooMany('You’re sending messages quickly. Please wait a moment.')),
            Limit::perHour(30)->by('user:'.$request->user()?->getAuthIdentifier())->response($tooMany('You’ve sent a lot of messages. Please wait a little.')),
        ]);
        RateLimiter::for('stock-alerts', fn (Request $request) => Limit::perHour(40)->by('user:'.$request->user()?->getAuthIdentifier())
            ->response($tooMany('Too many requests. Please wait a little.')));
    }
}
