<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Account\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\Activity;
use App\Models\User;
use App\Notifications\EmailChanged;
use App\Support\LoginThrottle;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

/** The signed-in buyer's own details. There is no buyer id in the URL: the session says whose account it is. */
class ProfileController extends Controller
{
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function update(UpdateProfileRequest $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();
        $user->fill(array_intersect_key($data, array_flip(['first_name', 'last_name', 'phone', 'marketing_opt_in'])));

        $oldEmail = $user->email;
        $newEmail = isset($data['email']) ? User::normalizeEmail($data['email']) : $oldEmail;
        if ($newEmail !== $oldEmail) {
            // A new sign-in email needs the current password (with its own attempt limit) and a free address.
            $throttle = new LoginThrottle('current-password', 'user:'.$user->id, (string) $request->ip());
            $throttle->ensureAllowed();
            if (! $user->password || ! Hash::check((string) ($data['current_password'] ?? ''), $user->password)) {
                $throttle->failed();
                throw new ApiException(422, 'WRONG_PASSWORD', 'Enter your current password to change your email.', ['current_password' => ['Enter your current password to change your email.']]);
            }
            $throttle->succeeded();
            if (User::where('email', $newEmail)->whereKeyNot($user->id)->exists()) {
                throw $this->emailTaken();
            }
            $user->email = $newEmail;
            $user->email_verified_at = null;
        }

        try {
            $user->save();
        } catch (UniqueConstraintViolationException) {
            throw $this->emailTaken();
        }

        if ($newEmail !== $oldEmail) {
            Notification::route('mail', $oldEmail)->notify(new EmailChanged($newEmail));
            Activity::record('customer.email_changed', "{$user->fullName()} changed their sign-in email", $user, null, $user);
        }

        return new UserResource($user);
    }

    private function emailTaken(): ApiException
    {
        $message = 'Another account already uses this email.';

        return new ApiException(409, 'EMAIL_ALREADY_EXISTS', $message, ['email' => [$message]]);
    }
}
