<?php

namespace Tests\Feature\Platform;

use Tests\TestCase;

class SecurityTest extends TestCase
{
    public function test_api_responses_carry_hardening_headers_and_are_never_cached(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_the_spa_gets_an_httponly_session_cookie_and_a_csrf_cookie(): void
    {
        $response = $this->fromSpa()->get('/api/v1/sanctum/csrf-cookie')->assertNoContent();

        $session = collect($response->headers->getCookies())->firstWhere(fn ($c) => $c->getName() === config('session.cookie'));
        $xsrf = collect($response->headers->getCookies())->firstWhere(fn ($c) => $c->getName() === 'XSRF-TOKEN');

        $this->assertNotNull($session, 'session cookie');
        $this->assertTrue($session->isHttpOnly());
        $this->assertSame('lax', $session->getSameSite());
        $this->assertNotNull($xsrf, 'XSRF-TOKEN cookie');
        $this->assertFalse($xsrf->isHttpOnly(), 'the SPA reads XSRF-TOKEN to send it back as X-XSRF-TOKEN');
    }

    public function test_cross_origin_callers_are_not_allowed_by_default(): void
    {
        $this->withHeaders(['Origin' => 'https://evil.example', 'Access-Control-Request-Method' => 'POST'])
            ->options('/api/v1/health')
            ->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    public function test_a_listed_origin_may_call_with_cookies(): void
    {
        config(['cors.allowed_origins' => ['https://admin.dmdworld.store']]);

        $this->withHeaders(['Origin' => 'https://admin.dmdworld.store', 'Access-Control-Request-Method' => 'POST'])
            ->options('/api/v1/health')
            ->assertHeader('Access-Control-Allow-Origin', 'https://admin.dmdworld.store')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_database_provisioning_refuses_root_as_the_app_account(): void
    {
        config(['database.connections.mysql.database' => 'dmd_world', 'database.connections.mysql.username' => 'root']);

        $this->artisan('db:provision', ['--no-admin-password' => true])
            ->expectsOutputToContain('dedicated account')
            ->assertFailed();
    }

    public function test_database_provisioning_refuses_unsafe_database_names(): void
    {
        config(['database.connections.mysql.database' => 'dmd`; DROP DATABASE mysql; --']);

        $this->artisan('db:provision', ['--no-admin-password' => true])
            ->expectsOutputToContain('letters, numbers and underscores')
            ->assertFailed();
    }
}
