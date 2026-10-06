<?php

namespace Tests;

use App\Models\Admin;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /** The SPA's origin: Sanctum only gives cookie sessions to requests from a stateful domain. */
    protected const SPA = 'http://localhost:5173';

    public const OWNER_PASSWORD = 'Owner-Pass-2026!';

    private int $clients = 0;

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

    /** A new browser with its own cookies and address. */
    protected function client(?string $ip = null): SpaClient
    {
        return new SpaClient($this, $ip ?? '10.0.0.'.(++$this->clients));
    }

    /** A browser signed in as a (new) buyer. */
    protected function buyer(?User $user = null): SpaClient
    {
        $user ??= User::factory()->create();
        $client = $this->client();
        $client->post('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::DEFAULT_PASSWORD])->assertOk();

        return $client;
    }

    /** A browser signed in as the store owner. */
    protected function owner(): SpaClient
    {
        $owner = Admin::owner() ?? Admin::create(['name' => 'DMD World', 'email' => 'owner@dmdworld.test', 'password' => self::OWNER_PASSWORD]);
        $client = $this->client();
        $client->post('/api/v1/admin/auth/login', ['email' => $owner->email, 'password' => self::OWNER_PASSWORD])->assertOk();

        return $client;
    }

    /** @internal Used by SpaClient: one request as that browser, like a fresh PHP process would serve it. */
    public function spaCall(SpaClient $client, string $method, string $uri, array $data, array $headers): TestResponse
    {
        // Nothing carries over in memory between requests, exactly like separate PHP processes: only the cookies the
        // browser sends back. Sessions live in MySQL as in production, so every request reads its own session.
        // `auth:admin` switches the default guard by writing to config, which in a real deployment is fresh for
        // every request; here it would leak into the next one.
        config(['auth.defaults.guard' => 'web']);
        $this->app['auth']->forgetGuards();
        $this->app['auth']->resolveUsersUsing(fn ($guard = null) => $this->app['auth']->guard($guard)->user());
        $this->app->forgetInstance('auth.driver');
        $this->app['cookie']->flushQueuedCookies();
        config(['session.driver' => 'database']);
        $this->app['session']->forgetDrivers();
        $this->app->forgetInstance('session.store');
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];
        $this->serverVariables = ['REMOTE_ADDR' => $client->ip];

        return $this->withHeaders(['Origin' => self::SPA, 'Referer' => self::SPA.'/', ...$headers])
            ->withCredentials() // JSON requests in tests only send cookies when asked to
            ->withUnencryptedCookies($client->cookies)
            ->json($method, $uri, $data);
    }
}
