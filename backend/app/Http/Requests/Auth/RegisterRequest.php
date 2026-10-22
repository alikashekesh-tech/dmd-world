<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;
use App\Rules\StrongPassword;

class RegisterRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'first_name' => self::nameRules(),
            'last_name' => self::nameRules(),
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'phone' => self::phoneRules(),
            'password' => ['required', 'string', new StrongPassword, 'confirmed'],
            'marketing_opt_in' => ['sometimes', 'boolean'],
        ];
    }
}
