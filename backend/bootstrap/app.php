<?php

use App\Exceptions\ApiExceptionRenderer;
use App\Http\Middleware\AuthenticateGuardSession;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\RequireSession;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // Versioned prefix, so a future /api/v2 can live next to it.
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        // The owner's API: same middleware as the storefront API, its own guard (see routes/admin.php).
        then: function () {
            Route::middleware('api')->prefix('api/v1/admin')->name('admin.')->group(base_path('routes/admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The React SPA signs in with Sanctum's cookie sessions (CSRF-protected), never with tokens in JavaScript.
        $middleware->statefulApi();
        $middleware->throttleApi();
        $middleware->prependToGroup('api', ForceJsonResponse::class);
        $middleware->append(SecurityHeaders::class);
        // auth.session ends only the guard it checks (owner and buyer share one browser session).
        $middleware->alias(['session' => RequireSession::class, 'auth.session' => AuthenticateGuardSession::class]);
        // Guests are answered with 401, never redirected to a login page (there is none: the UIs are React).
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Every API error has the same JSON shape, and never a stack trace or a database message.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(fn (Throwable $e, Request $request) => $request->is('api/*') ? ApiExceptionRenderer::render($e) : null);
    })->create();
