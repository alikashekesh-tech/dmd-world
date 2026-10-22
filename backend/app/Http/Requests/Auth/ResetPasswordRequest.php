<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;
use App\Rules\StrongPassword;

class ResetPasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        $checking = $this->routeIs('auth.reset.check');

        return [
            'token' => ['required', 'string', 'max:200'],
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'password' => $checking ? ['prohibited'] : ['required', 'string', new StrongPassword, 'confirmed'],
        ];
    }
}
