<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /** The SPA's origin: Sanctum only gives cookie sessions to requests from a stateful domain. */
    protected const SPA = 'http://localhost:5173';

    public function createApplication()
    {
        $app = parent::createApplication();

        // Tests refresh (wipe) their database. Refuse to start against anything but a *_testing database, before
        // any migration runs, so a stray DB_DATABASE can never empty the development or production data.
        $connection = $app['config']->get('database.default');
        $database = (string) $app['config']->get("database.connections.{$connection}.database");
        if (! str_ends_with($database, '_testing')) {
            throw new RuntimeException("Tests must use a *_testing database, not [{$database}].");
        }

        return $app;
    }

    /** Headers a browser on the storefront sends with same-origin API calls. */
    protected function fromSpa(): static
    {
        return $this->withHeaders(['Origin' => self::SPA, 'Referer' => self::SPA.'/', 'Accept' => 'application/json']);
    }
}
