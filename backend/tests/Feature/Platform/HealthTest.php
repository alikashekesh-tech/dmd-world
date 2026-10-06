<?php

namespace Tests\Feature\Platform;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_reports_the_api_and_mysql_as_up(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJson(['status' => 'ok', 'database' => 'up']);

        $this->assertSame('mysql', DB::connection()->getDriverName());
    }

    public function test_health_answers_503_without_details_when_mysql_fails(): void
    {
        // A database the app account can't open: MySQL answers at once with an error the client must not see.
        config(['database.connections.mysql.database' => 'dmd_missing_testing']);
        DB::purge('mysql');

        $response = $this->getJson('/api/v1/health')
            ->assertStatus(503)
            ->assertJson(['status' => 'degraded', 'database' => 'down']);

        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
    }

    public function test_health_still_answers_when_the_cache_and_sessions_are_in_the_failing_mysql_too(): void
    {
        // As configured for real (.env): rate-limit counters and sessions live in MySQL as well.
        config(['cache.default' => 'database', 'session.driver' => 'database', 'database.connections.mysql.database' => 'dmd_missing_testing']);
        DB::purge('mysql');

        $this->fromSpa()->getJson('/api/v1/health')
            ->assertStatus(503)
            ->assertJsonPath('database', 'down');
    }

    public function test_the_root_url_identifies_the_api(): void
    {
        $this->get('/')->assertOk()->assertJson(['name' => 'DMD World']);
    }
}
