<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\LoginThrottle;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

/** Buyer accounts: sign up, sign in, sign out, who am I. */
class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (User::where('email', $data['email'])->exists()) {
            throw $this->emailTaken();
        }

        try {
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'],
                'marketing_opt_in' => (bool) ($data['marketing_opt_in'] ?? false),
            ]);
        } catch (UniqueConstraintViolationException) {
            throw $this->emailTaken(); // two sign-ups with the same email at the same moment
        }

        $this->signIn($request, $user, true);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function login(LoginRequest $request): UserResource
    {
        $email = $request->validated('email');
        $throttle = new LoginThrottle('buyer', $email, (string) $request->ip());
        $throttle->ensureAllowed();

        // attempt() takes the same time whether or not the account exists, and accounts without a password
        // (imported customers who haven't chosen one yet) can't sign in.
        if (! Auth::guard('web')->attempt(['email' => $email, 'password' => $request->validated('password')])) {
            $throttle->failed();
            throw new ApiException(401, 'INVALID_CREDENTIALS', 'That email and password don’t match an account.');
        }
        $throttle->succeeded();

        /** @var User $user */
        $user = Auth::guard('web')->user();
        $this->signIn($request, $user, $request->boolean('remember', true));

        return new UserResource($user);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        // A new session id and CSRF token. The session itself isn't emptied, so an owner signed in to the admin in the
        // same browser stays signed in there.
        $request->session()->regenerate(true);
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    private function signIn(Request $request, User $user, bool $remember): void
    {
        Auth::guard('web')->login($user, $remember);
        $request->session()->regenerate(); // a new session id at every sign-in: no session fixation
        $user->forceFill(['last_login_at' => now()])->save();
    }

    private function emailTaken(): ApiException
    {
        $message = 'An account with this email already exists. Sign in, or reset your password if you forgot it.';

        return new ApiException(409, 'EMAIL_ALREADY_EXISTS', $message, ['email' => [$message]]);
    }
}
