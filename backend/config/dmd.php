<?php

/*
| DMD World settings that belong to this deployment (not to the store's data, which lives in MySQL).
*/

$list = fn (?string $value) => array_values(array_filter(array_map('trim', explode(',', (string) $value))));

return [

    // Where the React storefront and the owner's admin are served. Links in emails (password resets) point here.
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),
    'admin_url' => rtrim((string) env('ADMIN_URL', env('FRONTEND_URL', 'http://localhost:5173').'/admin'), '/'),

    // Reverse proxies whose X-Forwarded-* headers are believed (client address for rate limits, https detection).
    // Development: the Vite dev server on 127.0.0.1. Production: the address of Caddy/nginx in front.
    'trusted_proxies' => $list(env('TRUSTED_PROXIES', '127.0.0.1,::1')),

    // Name of the MySQL database the test suite uses (never the development or production one).
    'testing_database' => env('DB_TEST_DATABASE'),

];
