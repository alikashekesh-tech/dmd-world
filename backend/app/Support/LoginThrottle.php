<?php

namespace App\Support;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Slows down password guessing. Wrong passwords are counted per account-and-address and per address; past the limit
 * every attempt is refused (429) until the window passes. A successful sign-in clears the account-and-address count.
 */
class LoginThrottle
{
    private const WINDOW = 15 * 60;

    /** [per account+address, per address] failures allowed in the window. */
    private const LIMITS = ['buyer' => [5, 30], 'admin' => [5, 10], 'current-password' => [5, 5]];

    public function __construct(private string $scope, private string $account, private string $ip) {}

    public function ensureAllowed(): void
    {
        [$perAccount, $perIp] = self::LIMITS[$this->scope];
        foreach ([[$this->accountKey(), $perAccount], [$this->ipKey(), $perIp]] as [$key, $max]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $wait = RateLimiter::availableIn($key);
                throw new ApiException(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait '.max(1, (int) ceil($wait / 60)).' minutes and try again.', [], ['Retry-After' => (string) $wait]);
            }
        }
    }

    public function failed(): void
    {
        RateLimiter::hit($this->accountKey(), self::WINDOW);
        RateLimiter::hit($this->ipKey(), self::WINDOW);
    }

    public function succeeded(): void
    {
        RateLimiter::clear($this->accountKey());
    }

    private function accountKey(): string
    {
        return "login:{$this->scope}:".sha1($this->account.'|'.$this->ip);
    }

    private function ipKey(): string
    {
        return "login:{$this->scope}-ip:".sha1($this->ip);
    }
}
