<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\Admin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Owner-only admin routes (store settings, staff accounts): a member of staff gets 403. Runs after auth:admin. */
class EnsureOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        $admin = $request->user('admin');
        if (! $admin instanceof Admin || ! $admin->isOwner()) {
            throw new ApiException(403, 'OWNER_ONLY', 'Only the store owner can do this.');
        }

        return $next($request);
    }
}
