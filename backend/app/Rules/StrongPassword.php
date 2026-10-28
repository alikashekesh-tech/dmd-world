<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * DMD World's password policy, the same rules and wording as shared/passwordPolicy.js (which the React apps use for
 * their live checklist). This class is the one that is enforced.
 */
class StrongPassword implements ValidationRule
{
    public const MIN = 8;

    public const MAX = 128;

    /** @return array<string, array{string, callable(string): bool}> */
    public static function rules(): array
    {
        return [
            'length' => ['at least '.self::MIN.' characters', fn (string $p) => mb_strlen($p) >= self::MIN],
            'upper' => ['one uppercase letter (A–Z)', fn (string $p) => (bool) preg_match('/\p{Lu}/u', $p)],
            'lower' => ['one lowercase letter (a–z)', fn (string $p) => (bool) preg_match('/\p{Ll}/u', $p)],
            'number' => ['one number (0–9)', fn (string $p) => (bool) preg_match('/\p{Nd}/u', $p)],
            'special' => ['one special character (! @ # …)', fn (string $p) => (bool) preg_match('/[^\p{L}\p{N}\s]/u', $p)],
        ];
    }

    /** Null when acceptable, otherwise one sentence naming what is missing. */
    public static function problem(mixed $password): ?string
    {
        if (! is_string($password) || ! mb_check_encoding($password, 'UTF-8')) {
            return 'Enter a password.';
        }
        if (mb_strlen($password) > self::MAX) {
            return 'Use at most '.self::MAX.' characters.';
        }
        $missing = array_values(array_map(fn ($r) => $r[0], array_filter(self::rules(), fn ($r) => ! $r[1]($password))));

        return $missing ? 'The password needs: '.implode(', ', $missing).'.' : null;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($problem = self::problem($value)) {
            $fail($problem);
        }
    }
}
