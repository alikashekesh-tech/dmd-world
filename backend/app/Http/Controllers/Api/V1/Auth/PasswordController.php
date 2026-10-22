<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\LoginThrottle;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/** Buyer passwords: change while signed in, or reset a forgotten one by email. */
class PasswordController extends Controller
{
    public function update(ChangePasswordRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        // Its own limit, so a stolen session can't be used to guess the current password.
        $throttle = new LoginThrottle('current-password', 'user:'.$user->id, (string) $request->ip());
        $throttle->ensureAllowed();
        if (! $user->password || ! Hash::check($request->validated('current_password'), $user->password)) {
            $throttle->failed();
            throw new ApiException(422, 'WRONG_PASSWORD', 'Your current password isn’t right.', ['current_password' => ['Your current password isn’t right.']]);
        }
        $throttle->succeeded();

        // A new password hash and remember token sign out every other device; this one is signed in again.
        $user->forceFill(['password' => $request->validated('password'), 'remember_token' => Str::random(60)])->save();
        Auth::guard('web')->login($user, true);

        return response()->json(['message' => 'Password changed. Your other devices have been signed out.']);
    }

    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $email = $request->validated('email');
        Password::broker('users')->sendResetLink(['email' => $email]);

        // The same answer whether or not the account exists (or a link was sent a minute ago), so this form can't be
        // used to find out who shops here.
        return response()->json(['message' => "If an account uses {$email}, we’ve emailed it a link to choose a new password. The link works for 60 minutes."]);
    }

    public function check(ResetPasswordRequest $request): JsonResponse
    {
        $user = User::where('email', $request->validated('email'))->first();

        return response()->json(['valid' => $user !== null && Password::broker('users')->tokenExists($user, $request->validated('token'))]);
    }

    public function reset(ResetPasswordRequest $request): UserResource
    {
        $data = $request->validated();
        $status = Password::broker('users')->reset(
            ['email' => $data['email'], 'token' => $data['token'], 'password' => $data['password']],
            function (User $user, string $password) {
                $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
                event(new PasswordReset($user));
            },
        );
        if ($status !== Password::PASSWORD_RESET) {
            throw new ApiException(422, 'RESET_LINK_INVALID', 'This reset link has expired or was already used. Ask for a new one.');
        }

        // The link proved the email address; sign the buyer straight in (every other device was signed out).
        $user = User::where('email', $data['email'])->firstOrFail();
        Auth::guard('web')->login($user, true);
        $request->session()->regenerate();
        $user->forceFill(['last_login_at' => now()])->save();

        return new UserResource($user);
    }
}
