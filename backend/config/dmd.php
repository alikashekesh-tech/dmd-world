<?php

/*
| DMD World settings that belong to this deployment (not to the store's data, which lives in MySQL).
*/

$list = fn (?string $value) => array_values(array_filter(array_map('trim', explode(',', (string) $value))));

return [

    // Where the React storefront and the owner's admin are served. Links in emails (password resets) point here.
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),
    'admin_url' => rtrim((string) env('ADMIN_URL', env('FRONTEND_URL', 'http://localhost:5173').'/admin'), '/'),

    // The store's own timezone: where "today" and each day of the owner's dashboard begin. Dates are stored in UTC.
    'timezone' => env('STORE_TIMEZONE', 'Asia/Beirut'),

    // Reverse proxies whose X-Forwarded-* headers are believed (client address for rate limits, https detection).
    // Development: the Vite dev server on 127.0.0.1. Production: the address of Caddy/nginx in front.
    'trusted_proxies' => $list(env('TRUSTED_PROXIES', '127.0.0.1,::1')),

    // `php artisan dmd:import` reads the old WooCommerce store from here (GET requests only). A read-only REST key is
    // enough. Used at go-live (docs/deployment.md); not needed once the old store is switched off.
    'import' => [
        'woocommerce' => [
            'url' => env('IMPORT_WOO_URL'),
            'key' => env('IMPORT_WOO_KEY'),
            'secret' => env('IMPORT_WOO_SECRET'),
        ],
        // `php artisan dmd:import-media` copies images only from these hosts: the old store's own host, plus any listed
        // (comma-separated) in IMPORT_MEDIA_HOSTS, e.g. dmdworld.store when IMPORT_WOO_URL points elsewhere.
        'media_hosts' => array_values(array_unique(array_filter(array_map('strtolower', [
            parse_url((string) env('IMPORT_WOO_URL'), PHP_URL_HOST) ?: null,
            ...$list(env('IMPORT_MEDIA_HOSTS')),
        ])))),
    ],

    // Name of the MySQL database the test suite uses (never the development or production one).
    'testing_database' => env('DB_TEST_DATABASE'),

];
