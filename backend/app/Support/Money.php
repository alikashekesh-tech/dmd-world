<?php

namespace App\Support;

/**
 * Money is stored as DECIMAL(10,2) and calculated in whole cents (integers), so no floating-point rounding ever
 * creeps into a price, a discount or a total.
 */
final class Money
{
    public static function cents(string|int|float|null $amount): int
    {
        if ($amount === null || $amount === '') {
            return 0;
        }
        if (is_string($amount) && preg_match('/^(-)?(\d+)(?:\.(\d{1,2}))?$/', trim($amount), $m)) {
            return ($m[1] === '-' ? -1 : 1) * ((int) $m[2] * 100 + (int) str_pad($m[3] ?? '0', 2, '0'));
        }

        return (int) round(((float) $amount) * 100);
    }

    /** For DECIMAL columns: "28.00". */
    public static function decimal(int $cents): string
    {
        return ($cents < 0 ? '-' : '').intdiv(abs($cents), 100).'.'.str_pad((string) (abs($cents) % 100), 2, '0', STR_PAD_LEFT);
    }

    /** For JSON: 28 or 28.5 (a number with at most two decimals). */
    public static function json(int $cents): int|float
    {
        return $cents % 100 === 0 ? intdiv($cents, 100) : round($cents / 100, 2);
    }
}
