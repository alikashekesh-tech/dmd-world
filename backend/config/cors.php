<?php

/*
| The React apps call the API on their own origin (the Vite dev server and the production reverse proxy forward
| /api/v1), so cross-origin access is normally not needed at all. Only origins listed in CORS_ALLOWED_ORIGINS may
| call it from elsewhere, with cookies.
*/

return [

    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN'],

    'exposed_headers' => ['Retry-After'],

    'max_age' => 600,

    'supports_credentials' => true,

];
