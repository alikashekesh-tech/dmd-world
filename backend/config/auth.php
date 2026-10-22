<?php

use App\Models\Admin;
use App\Models\User;

/*
| Two separate authentication domains that share nothing but the session cookie:
|  - web   → buyers (users table). Used by auth:sanctum on the storefront API.
|  - admin → the store owner (admins table, exactly one row). Used by auth:admin on /api/v1/admin.
| A buyer session never satisfies the admin guard and the owner is never a buyer: different tables, different
| session keys, no role column that could be flipped.
*/

return [

    'defaults' => [
        'guard' => 'web',
        'passwords' => 'users',
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
            // "Remember me": buyers stay signed in on their device for 30 days.
            'remember' => 60 * 24 * 30,
        ],
        'admin' => [
            'driver' => 'session',
            'provider' => 'admins',
            // No long-lived remember cookie for the owner: the session ends after SESSION_LIFETIME idle minutes.
            'remember' => 0,
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => User::class,
        ],
        'admins' => [
            'driver' => 'eloquent',
            'model' => Admin::class,
        ],
    ],

    /*
    | Buyers reset forgotten passwords by email (hashed token, 60 minutes, one request per minute per account).
    | The owner has no email reset: their password is changed while signed in or with `php artisan dmd:owner --reset`
    | on the server, which keeps the most valuable account off the public internet's reset form.
    */
    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => 10800,

];
