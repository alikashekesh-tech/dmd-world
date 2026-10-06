<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;
use App\Rules\StrongPassword;

/** Used by both accounts (buyer and owner) to change their password while signed in. */
class ChangePasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:256'],
            'password' => ['required', 'string', new StrongPassword, 'confirmed', 'different:current_password'],
        ];
    }
}
