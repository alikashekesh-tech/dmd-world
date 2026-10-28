<?php

namespace App\Http\Requests\Account;

use App\Http\Requests\ApiRequest;

/** A buyer editing their own details. Changing the sign-in email also needs the current password. */
class UpdateProfileRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'first_name' => ['sometimes', ...array_slice(self::nameRules(), 1)],
            'last_name' => ['sometimes', ...array_slice(self::nameRules(), 1)],
            'phone' => self::phoneRules(),
            'marketing_opt_in' => ['sometimes', 'boolean'],
            'email' => ['sometimes', 'string', 'email:rfc', 'max:254'],
            'current_password' => ['nullable', 'string', 'max:256'],
        ];
    }
}
