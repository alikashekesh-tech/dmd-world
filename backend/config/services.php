<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // WhatsApp/SMS texts (back in stock, cart reminders, order updates). "none": nothing is sent; a provider driver
    // and its credentials are needed before these channels work (App\Services\Messaging\Messenger).
    'messaging' => [
        'driver' => env('MESSAGING_DRIVER', 'none'),
    ],

    // The shopping assistant's AI provider. "none": it answers from the catalog only, and nothing is billed. A provider
    // is added (with its key here, from .env) only once the store approves one and sets a budget in Settings.
    'assistant' => [
        'driver' => env('ASSISTANT_DRIVER', 'none'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
