<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class ForgotPasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['email' => ['required', 'string', 'email:rfc', 'max:254']];
    }
}
