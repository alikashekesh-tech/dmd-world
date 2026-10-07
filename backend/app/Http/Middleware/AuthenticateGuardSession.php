<?php

namespace App\Http\Middleware;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Session\Middleware\AuthenticateSession;

/**
 * Laravel's `auth.session` (a session signs out once its user's password changed on another device), with one
 * difference: it ends only the guard it checks. Laravel's version empties the whole session, and one browser holds a
 * single session for both guards (the owner in the admin, a buyer on the storefront), so an owner signed out by a
 * password change elsewhere would also sign out a buyer using the same browser. Same behaviour as the logout
 * endpoints: that guard's sign-in goes, the session gets a new id and CSRF token, the other guard's sign-in stays.
 */
class AuthenticateGuardSession extends AuthenticateSession
{
    protected function logout($request)
    {
        $guard = $this->auth->getDefaultDriver();
        $this->guard()->logoutCurrentDevice();
        $request->session()->forget('password_hash_'.$guard);
        $request->session()->migrate(true);
        $request->session()->regenerateToken();

        throw new AuthenticationException('Unauthenticated.', [$guard], $this->redirectTo($request));
    }
}
