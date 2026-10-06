<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

/** Used by both sign-in forms (buyer and owner). */
class LoginRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'max:256'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return ['password.required' => 'Enter your password.'] + parent::messages();
    }
}
