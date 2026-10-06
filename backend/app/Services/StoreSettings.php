<?php

namespace App\Services;

/**
 * Store-wide settings the code reads. Defaults live here; the owner's values are stored in MySQL (settings table,
 * added with the homepage and offers in Phase 9).
 */
final class StoreSettings
{
    public const DEFAULTS = [
        'low_stock_threshold' => 2,
    ];

    public static function get(string $key): mixed
    {
        return self::DEFAULTS[$key] ?? null;
    }

    public static function lowStockThreshold(): int
    {
        return (int) self::get('low_stock_threshold');
    }
}
