<?php

namespace Tests\Feature\Platform;

use App\Exceptions\ApiException;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

/** Every API failure has the shape {"error": {"code", "message", "fields"?}} and leaks nothing internal. */
class ApiErrorsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Probe routes, registered like real API routes (api middleware group, /api/v1 prefix).
        Route::middleware('api')->prefix('api/v1')->group(function () {
            Route::post('_probe/validate', fn (Request $r) => $r->validate(['email' => ['required', 'email'], 'name' => ['required']]));
            Route::get('_probe/crash', fn () => throw new RuntimeException('SQLSTATE[42S02]: Base table or view not found: users'));
            Route::get('_probe/rule', fn () => throw new ApiException(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.'));
            Route::get('_probe/private', fn () => 'secret')->middleware('auth:sanctum');
            Route::get('_probe/ok', fn () => ['ok' => true]);
        });
    }

    public function test_unknown_routes_get_a_json_404_even_without_an_accept_header(): void
    {
        $this->get('/api/v1/nope')
            ->assertNotFound()
            ->assertHeader('Content-Type', 'application/json')
            ->assertExactJson(['error' => ['code' => 'NOT_FOUND', 'message' => 'Not found.']]);
    }

    public function test_wrong_method_is_405(): void
    {
        $this->deleteJson('/api/v1/health')->assertStatus(405)->assertJsonPath('error.code', 'METHOD_NOT_ALLOWED');
    }

    public function test_validation_errors_name_the_fields_and_lead_with_the_first_problem(): void
    {
        $this->postJson('/api/v1/_probe/validate', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED')
            ->assertJsonPath('error.message', 'The email field must be a valid email address.')
            ->assertJsonStructure(['error' => ['fields' => ['email', 'name']]]);
    }

    public function test_server_errors_never_reveal_internal_messages(): void
    {
        $response = $this->getJson('/api/v1/_probe/crash')
            ->assertStatus(500)
            ->assertExactJson(['error' => ['code' => 'SERVER_ERROR', 'message' => 'Something went wrong on our side. Please try again.']]);

        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
    }

    public function test_business_rule_errors_carry_their_own_code(): void
    {
        $this->getJson('/api/v1/_probe/rule')
            ->assertStatus(409)
            ->assertExactJson(['error' => ['code' => 'EMAIL_ALREADY_EXISTS', 'message' => 'An account with this email already exists.']]);
    }

    public function test_signed_out_requests_are_401(): void
    {
        $this->fromSpa()->get('/api/v1/_probe/private')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_bearer_tokens_are_ignored_rather_than_looked_up(): void
    {
        // Only cookie sessions are accepted; a token is neither a way in nor a server error.
        $this->withHeader('Authorization', 'Bearer 1|abcdefghijklmnopqrstuvwxyz')
            ->getJson('/api/v1/_probe/private')
            ->assertUnauthorized();
    }

    public function test_rate_limited_requests_get_429_with_retry_after(): void
    {
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(2)->by($r->ip()));

        $this->getJson('/api/v1/_probe/ok')->assertOk();
        $this->getJson('/api/v1/_probe/ok')->assertOk();
        $this->getJson('/api/v1/_probe/ok')
            ->assertStatus(429)
            ->assertHeader('Retry-After')
            ->assertJsonPath('error.code', 'TOO_MANY_REQUESTS');
    }
}
