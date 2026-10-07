<?php

namespace Tests\Feature\Platform;

use App\Models\Admin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** php artisan dmd:preflight: production must be configured safely and honestly before go-live. */
class PreflightTest extends TestCase
{
    use RefreshDatabase;

    private function production(array $overrides = []): void
    {
        config([
            'app.env' => 'production', 'app.debug' => false, 'app.url' => 'https://shop.example.com',
            'dmd.frontend_url' => 'https://shop.example.com', 'dmd.admin_url' => 'https://shop.example.com/admin',
            'session.secure' => true, 'session.http_only' => true, 'session.same_site' => 'lax', 'session.encrypt' => true,
            'sanctum.stateful' => ['shop.example.com'], 'cors.allowed_origins' => [], 'mail.default' => 'smtp',
            'database.connections.mysql.username' => 'dmd_world', 'hashing.driver' => 'argon2id',
            'dmd.import.woocommerce.key' => null,
            ...$overrides,
        ]);
    }

    private function withOwner(): void
    {
        Admin::create(['name' => 'Owner', 'email' => 'owner@example.com', 'password' => self::OWNER_PASSWORD]);
    }

    public function test_a_safe_production_configuration_passes(): void
    {
        $this->withOwner();
        $this->production();
        $this->artisan('dmd:preflight')->expectsOutputToContain('Ready for production.')->assertSuccessful();
    }

    public function test_unsafe_or_dishonest_settings_fail_and_are_named(): void
    {
        $this->withOwner();
        $this->production(['app.debug' => true, 'session.secure' => false, 'mail.default' => 'log', 'sanctum.stateful' => ['localhost:5173']]);
        $this->artisan('dmd:preflight')
            ->expectsOutputToContain('APP_DEBUG is on')
            ->expectsOutputToContain('SESSION_SECURE_COOKIE is not true')
            ->expectsOutputToContain('only be written to the log')
            ->expectsOutputToContain('nobody could sign in')
            ->expectsOutputToContain('4 problem(s)')
            ->assertFailed();
    }

    public function test_a_missing_owner_account_fails(): void
    {
        $this->production();
        $this->artisan('dmd:preflight')->expectsOutputToContain('php artisan dmd:owner')->assertFailed();
    }

    public function test_session_cookies_default_to_https_only_on_an_https_site(): void
    {
        // config/session.php read in a fresh PHP process, with SESSION_SECURE_COOKIE left unset.
        $secure = function (string $url): mixed {
            $code = 'require "vendor/autoload.php"; new Illuminate\Foundation\Application(getcwd()); echo json_encode((require "config/session.php")["secure"]);';
            $run = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_URL' => $url, 'SESSION_SECURE_COOKIE' => false]);
            $run->mustRun();

            return json_decode($run->getOutput());
        };

        $this->assertTrue($secure('https://shop.example.com'));
        $this->assertFalse($secure('http://127.0.0.1:8000'));
    }
}
