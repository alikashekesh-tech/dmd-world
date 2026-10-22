<?php

namespace App\Services\Import;

use App\Services\StoreSettings;

/** The old store's settings that still mean something here: low-stock level, reviews and coupons on or off. */
final class SettingsImporter
{
    /** WooCommerce option → [our key, how to read it] */
    private const MAP = [
        'woocommerce_notify_low_stock_amount' => ['low_stock_threshold', 'int'],
        'woocommerce_enable_reviews' => ['reviews_enabled', 'yes'],
        'woocommerce_review_rating_verification_required' => ['reviews_require_purchase', 'yes'],
        'woocommerce_enable_coupons' => ['coupons_enabled', 'yes'],
    ];

    /** @param array<string, list<array{id: string, value: mixed}>> $groups settings per WooCommerce group */
    public function import(array $groups): array
    {
        $values = [];
        foreach ($groups as $settings) {
            foreach ($settings as $s) {
                [$key, $kind] = self::MAP[$s['id'] ?? ''] ?? [null, null];
                if ($key) {
                    $values[$key] = $kind === 'int' ? max(0, (int) $s['value']) : $s['value'] === 'yes';
                }
            }
        }
        StoreSettings::put($values);

        return ['settings' => count($values)];
    }
}
