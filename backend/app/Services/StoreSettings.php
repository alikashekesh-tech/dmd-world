<?php

namespace App\Services;

use App\Models\Activity;
use App\Models\Admin;
use App\Models\Order;
use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Store-wide settings. The owner's values live in MySQL (settings); any key they haven't set uses its default here.
 * Read once per request (and cached between requests until a setting changes).
 */
final class StoreSettings
{
    public const DEFAULTS = [
        'store_name' => 'DMD World',
        'contact_phone' => '+961 70 903 900',
        'contact_email' => 'info@dmdworld.store',
        'low_stock_threshold' => 2,
        'reviews_enabled' => true,
        'reviews_require_purchase' => false, // when true, only buyers with a paid order for the product can review it
        'coupons_enabled' => true,
        'payment_methods' => ['cod', 'bank_transfer'],
        'delivery_methods' => ['delivery', 'pickup'],
        'bank_transfer_note' => 'DMD sends the bank details when confirming your order.',
        'daily_revenue_target' => null, // dollars; the dashboard shows progress towards it when set
    ];

    /** Shown to everyone (in the storefront catalog); the rest are for the owner only. */
    public const PUBLIC = ['store_name', 'contact_phone', 'contact_email', 'reviews_enabled', 'coupons_enabled'];

    /** Validation for each key, used by the owner's settings screen. */
    public static function rules(): array
    {
        return [
            'store_name' => ['string', 'min:2', 'max:80'],
            'contact_phone' => ['string', 'max:30', 'regex:/^\+?[0-9][0-9\s().\-]{5,28}$/'],
            'contact_email' => ['string', 'email', 'max:254'],
            'low_stock_threshold' => ['integer', 'min:0', 'max:10000'],
            'reviews_enabled' => ['boolean'],
            'reviews_require_purchase' => ['boolean'],
            'coupons_enabled' => ['boolean'],
            'payment_methods' => ['array', 'min:1'],
            'payment_methods.*' => ['distinct', Rule::in(array_keys(Order::PAYMENT_METHODS))],
            'delivery_methods' => ['array', 'min:1'],
            'delivery_methods.*' => ['distinct', Rule::in(array_keys(Order::DELIVERY_METHODS))],
            'bank_transfer_note' => ['nullable', 'string', 'max:300'],
            'daily_revenue_target' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ];
    }

    /**
     * Every setting, defaults filled in. Kept on the application instance (one per request under php-fpm), and a
     * long-running process looks for changes at most once a minute, so reading a setting in a loop costs nothing.
     */
    public static function all(): array
    {
        $app = app();
        $memo = $app->bound('dmd.settings') ? $app->make('dmd.settings') : null;
        if ($memo && $memo['checked'] > microtime(true) - 60) {
            return $memo['values'];
        }
        $version = (string) Cache::get('settings:version', '0');
        if (! $memo || $memo['version'] !== $version) {
            $stored = Cache::rememberForever("settings:{$version}", fn () => Setting::query()->pluck('value', 'key')->all());
            $memo = ['version' => $version, 'values' => array_replace(self::DEFAULTS, array_intersect_key($stored, self::DEFAULTS))];
        }
        $app->instance('dmd.settings', ['checked' => microtime(true)] + $memo);

        return $memo['values'];
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }

    public static function publicValues(): array
    {
        return array_intersect_key(self::all(), array_flip(self::PUBLIC));
    }

    /** Saves some settings (already validated). The storefront catalog is refreshed, since some are shown there. */
    public static function put(array $values, ?Admin $by = null): array
    {
        $values = array_intersect_key($values, self::DEFAULTS);
        DB::transaction(function () use ($values, $by) {
            foreach ($values as $key => $value) {
                $row = Setting::find($key) ?? (new Setting)->forceFill(['key' => $key]);
                $row->forceFill(['value' => $value, 'updated_by' => $by?->id])->save();
            }
        });
        DB::afterCommit(function () {
            Cache::forever('settings:version', (string) hrtime(true));
            app()->forgetInstance('dmd.settings');
        });
        Catalog::bust();
        if ($by && $values) {
            Activity::record('settings.updated', 'Changed store settings: '.implode(', ', array_keys($values)), null, $by);
        }

        return self::all();
    }

    public static function lowStockThreshold(): int
    {
        return (int) self::get('low_stock_threshold');
    }

    /** @return array<string, string> enabled payment methods, id → title */
    public static function paymentMethods(): array
    {
        return array_intersect_key(Order::PAYMENT_METHODS, array_flip((array) self::get('payment_methods')));
    }

    /** @return array<string, string> enabled delivery methods, id → title */
    public static function deliveryMethods(): array
    {
        return array_intersect_key(Order::DELIVERY_METHODS, array_flip((array) self::get('delivery_methods')));
    }
}
