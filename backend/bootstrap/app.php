<?php

use App\Exceptions\ApiExceptionRenderer;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // Versioned prefix: during the migration the legacy Node server still answers /api and /admin/api,
        // so the two never collide. The owner's routes live under /api/v1/admin (Phase 2).
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The React SPA signs in with Sanctum's cookie sessions (CSRF-protected), never with tokens in JavaScript.
        $middleware->statefulApi();
        $middleware->throttleApi();
        $middleware->append(SecurityHeaders::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Every API error has the same JSON shape, and never a stack trace or a database message.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(fn (Throwable $e, Request $request) => $request->is('api/*') ? ApiExceptionRenderer::render($e) : null);
    })->create();
