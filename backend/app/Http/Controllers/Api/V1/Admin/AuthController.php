<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\AdminResource;
use App\Models\Admin;
use App\Support\LoginThrottle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/** The owner's sign-in. Entirely separate from buyer accounts: its own table, guard and session key. */
class AuthController extends Controller
{
    public function login(LoginRequest $request): AdminResource
    {
        $email = $request->validated('email');
        $throttle = new LoginThrottle('admin', $email, (string) $request->ip());
        $throttle->ensureAllowed();

        if (! Auth::guard('admin')->attempt(['email' => $email, 'password' => $request->validated('password')])) {
            $throttle->failed();
            throw new ApiException(401, 'INVALID_CREDENTIALS', 'That email and password are not right.');
        }
        $throttle->succeeded();

        $request->session()->regenerate();
        /** @var Admin $admin */
        $admin = Auth::guard('admin')->user();
        $admin->forceFill(['last_login_at' => now()])->save();

        return new AdminResource($admin);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('admin')->logout();
        $request->session()->regenerate(true);
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): AdminResource
    {
        return new AdminResource($request->user('admin'));
    }

    public function password(ChangePasswordRequest $request): JsonResponse
    {
        /** @var Admin $admin */
        $admin = $request->user('admin');
        $throttle = new LoginThrottle('current-password', 'admin:'.$admin->id, (string) $request->ip());
        $throttle->ensureAllowed();
        if (! Hash::check($request->validated('current_password'), $admin->password)) {
            $throttle->failed();
            throw new ApiException(422, 'WRONG_PASSWORD', 'Your current password is not right.', ['current_password' => ['Your current password is not right.']]);
        }
        $throttle->succeeded();

        // Other signed-in devices carry the old password hash in their session and are signed out on their next request.
        $admin->forceFill(['password' => $request->validated('password'), 'remember_token' => Str::random(60)])->save();
        Auth::guard('admin')->login($admin);
        $request->session()->put('password_hash_admin', Auth::guard('admin')->hashPasswordForCookie($admin->getAuthPassword()));

        return response()->json(['message' => 'Password changed. Other devices have been signed out.']);
    }
}
