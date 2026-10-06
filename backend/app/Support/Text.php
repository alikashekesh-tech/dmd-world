<?php

namespace App\Support;

final class Text
{
    /** HTML from the old store → plain text with paragraph breaks (the API stores and serves plain text only). */
    public static function plain(?string $html, int $max = 10000): string
    {
        $s = preg_replace(['/<br\s*\/?>/i', '/<\/(p|div|h[1-6]|li)>/i', '/<li[^>]*>/i'], ["\n", "\n\n", '• '], (string) $html);
        $s = html_entity_decode(strip_tags((string) $s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $s = preg_replace(["/[ \t\x{00A0}]+/u", "/\n{3,}/"], [' ', "\n\n"], $s);

        return mb_substr(trim((string) $s), 0, $max);
    }

    /**
     * Text a person typed (a review, a message), kept exactly as written apart from invisible control characters,
     * runs of blank lines and surrounding space. It is stored and served as plain text, never as HTML: "<b>" stays
     * the four characters a buyer typed, and every client renders it as text.
     */
    public static function multiline(?string $text, int $max): string
    {
        $s = str_replace(["\r\n", "\r"], "\n", (string) $text);
        $s = preg_replace(['/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', "/[ \t]+\n/", "/\n{3,}/"], ['', "\n", "\n\n"], $s) ?? '';

        return mb_substr(trim($s), 0, $max);
    }

    /** One line a person typed (a review title): like multiline, with line breaks turned into spaces. */
    public static function line(?string $text, int $max): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', self::multiline($text, $max * 2))), 0, $max);
    }

    /** Old store category names are often in capitals ("HEADPHONE MARVO"): make them readable. */
    public static function tidyName(string $name): string
    {
        $s = trim(html_entity_decode($name, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($s === mb_strtoupper($s) || $s === mb_strtolower($s)) {
            $s = mb_convert_case(mb_strtolower($s), MB_CASE_TITLE, 'UTF-8');
        }

        return preg_replace(['/\bPs(\d)/', '/NewGames/i', '/UsedGames/i', '/\bAcc\b/i'], ['PS$1', 'New Games', 'Used Games', 'Accessories'], $s);
    }

    /** An http(s) URL, or null. */
    public static function httpUrl(mixed $url): ?string
    {
        return is_string($url) && preg_match('#^https?://#i', $url) && filter_var($url, FILTER_VALIDATE_URL) && strlen($url) <= 2048 ? $url : null;
    }
}
