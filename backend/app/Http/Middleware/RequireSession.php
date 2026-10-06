<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sign-in, sign-up and sign-out only make sense with a cookie session, which Sanctum starts only for requests from
 * the storefront or admin (a stateful domain). Anything else gets a clear refusal instead of a server error.
 */
class RequireSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->hasSession()) {
            throw new ApiException(400, 'SESSION_REQUIRED', 'Please use the DMD World website to sign in.');
        }

        return $next($request);
    }
}
