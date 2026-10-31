<?php

namespace App\Support;

/**
 * Phone numbers as one canonical international form ("+96170903900"), so the same number typed as "70 903 900",
 * "+961 70 903 900" or "00961 70-903-900" is one number. A number without a country code is taken as Lebanese.
 */
final class Phone
{
    public const LEBANON = '961';

    /** "+96170903900", or null when it can't be a phone number. */
    public static function normalize(?string $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }
        $international = str_starts_with($raw, '+') || str_starts_with($raw, '00');
        $digits = preg_replace('/\D+/', '', $raw);
        if (str_starts_with($raw, '00')) {
            $digits = substr($digits, 2);
        }
        if (! $international) {
            $digits = str_starts_with($digits, self::LEBANON) && strlen($digits) >= 10 ? $digits : self::LEBANON.ltrim($digits, '0');
        }
        if (str_starts_with($digits, self::LEBANON.'0')) {
            $digits = self::LEBANON.substr($digits, 4); // +961 03 123 456 → +961 3 123 456
        }

        return preg_match('/^[1-9]\d{6,14}$/', $digits) ? '+'.$digits : null;
    }

    /** A wa.me link to start a WhatsApp chat with the number (the owner sends the message themselves). */
    public static function whatsAppUrl(string $phone, string $text = ''): string
    {
        return 'https://wa.me/'.ltrim((string) self::normalize($phone), '+').($text !== '' ? '?text='.rawurlencode($text) : '');
    }
}
