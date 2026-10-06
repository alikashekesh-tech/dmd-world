<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/** Base for API form requests: authorization is done by route middleware and policies, so requests only validate. */
abstract class ApiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** Trim text inputs and normalise the email before the rules run. */
    protected function prepareForValidation(): void
    {
        $clean = [];
        foreach ($this->all() as $key => $value) {
            if (is_string($value) && ! str_contains($key, 'password') && $key !== 'token') {
                $clean[$key] = trim($value);
            }
        }
        if ($this->has('email')) {
            $clean['email'] = User::normalizeEmail($this->input('email'));
        }
        $this->merge($clean);
    }

    /** A person's name: letters (any script), spaces, apostrophes, dots and hyphens. */
    protected static function nameRules(): array
    {
        return ['required', 'string', 'max:60', 'regex:/^[\p{L}\p{M}][\p{L}\p{M}\s\'’.\-]*$/u'];
    }

    protected static function phoneRules(bool $required = false): array
    {
        return [$required ? 'required' : 'nullable', 'string', 'max:30', 'regex:/^\+?[0-9][0-9\s().\-]{5,28}$/'];
    }

    public function messages(): array
    {
        return [
            'first_name.required' => 'Enter your first name.',
            'last_name.required' => 'Enter your last name.',
            'first_name.regex' => 'Use letters only in your first name.',
            'last_name.regex' => 'Use letters only in your last name.',
            'email.required' => 'Enter your email address.',
            'email.email' => 'Enter a valid email address.',
            'phone.regex' => 'That phone number doesn’t look right.',
            'password.required' => 'Enter a password.',
            'password.confirmed' => 'The two passwords don’t match.',
            'password.different' => 'Choose a password that’s different from your current one.',
            'current_password.required' => 'Enter your current password.',
        ];
    }
}
