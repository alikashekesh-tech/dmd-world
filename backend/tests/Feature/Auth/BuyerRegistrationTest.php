<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BuyerRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function form(array $over = []): array
    {
        return [
            'first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456',
            'password' => 'Strong-Pass-1', 'password_confirmation' => 'Strong-Pass-1', ...$over,
        ];
    }

    public function test_a_buyer_can_register_and_is_signed_in(): void
    {
        $browser = $this->client();

        $browser->post('/api/v1/auth/register', $this->form())
            ->assertCreated()
            ->assertJsonPath('data.email', 'rima@example.com')
            ->assertJsonPath('data.first_name', 'Rima')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.remember_token');

        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'rima@example.com');

        $user = User::firstWhere('email', 'rima@example.com');
        $this->assertStringStartsWith('$argon2id$', $user->password, 'stored as an Argon2id hash');
        $this->assertNotNull($user->last_login_at);
    }

    /**
     * Regression: with 5173 taken, Vite used to move to 5174/5175, and sign-up from there failed with SESSION_REQUIRED
     * ("Please use the DMD World website to sign in"): only the one dev address gets a cookie session.
     */
    #[DataProvider('otherOrigins')]
    public function test_only_the_canonical_dev_origin_gets_a_session(string $origin): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '10.7.7.7'])->withHeaders(['Origin' => $origin, 'Referer' => "{$origin}/"])
            ->postJson('/api/v1/auth/register', $this->form())
            ->assertStatus(400)->assertJsonPath('error.code', 'SESSION_REQUIRED');
        $this->assertDatabaseMissing('users', ['email' => 'rima@example.com']);

        $this->client()->post('/api/v1/auth/register', $this->form())->assertCreated(); // from http://127.0.0.1:5173
    }

    public static function otherOrigins(): array
    {
        return ['a fallback port' => ['http://127.0.0.1:5174'], 'another fallback port' => ['http://127.0.0.1:5175'],
            'localhost instead of 127.0.0.1' => ['http://localhost:5173'], 'another site' => ['https://evil.example']];
    }

    public function test_the_email_is_trimmed_and_lower_cased(): void
    {
        $this->client()->post('/api/v1/auth/register', $this->form(['email' => '  Rima.Haddad@Example.COM ']))->assertCreated();

        $this->assertDatabaseHas('users', ['email' => 'rima.haddad@example.com']);
        $this->client()->post('/api/v1/auth/login', ['email' => 'RIMA.haddad@example.com', 'password' => 'Strong-Pass-1'])->assertOk();
    }

    public function test_an_email_can_only_be_used_once_whatever_its_case(): void
    {
        $this->client()->post('/api/v1/auth/register', $this->form())->assertCreated();

        $this->client()->post('/api/v1/auth/register', $this->form(['email' => 'RIMA@example.com', 'first_name' => 'Other']))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'EMAIL_ALREADY_EXISTS')
            ->assertJsonStructure(['error' => ['fields' => ['email']]]);

        $this->assertSame(1, User::count());
    }

    public static function weakPasswords(): array
    {
        return [
            'too short' => ['Ab1!xyz', 'at least 8 characters'],
            'no uppercase' => ['strong-pass-1', 'one uppercase letter'],
            'no lowercase' => ['STRONG-PASS-1', 'one lowercase letter'],
            'no number' => ['Strong-Pass-x', 'one number'],
            'no special character' => ['StrongPass1', 'one special character'],
            'a space is not a special character' => ['Strong Pass1', 'one special character'],
        ];
    }

    #[DataProvider('weakPasswords')]
    public function test_weak_passwords_are_refused_by_the_server(string $password, string $missing): void
    {
        $this->client()->post('/api/v1/auth/register', $this->form(['password' => $password, 'password_confirmation' => $password]))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED')
            ->assertJsonPath('error.fields.password.0', fn (string $m) => str_contains($m, $missing));

        $this->assertSame(0, User::count());
    }

    public function test_the_two_passwords_must_match(): void
    {
        $this->client()->post('/api/v1/auth/register', $this->form(['password_confirmation' => 'Strong-Pass-2']))
            ->assertStatus(422)
            ->assertJsonPath('error.fields.password.0', 'The two passwords don’t match.');
    }

    public function test_required_fields_and_formats_are_checked(): void
    {
        $this->client()->post('/api/v1/auth/register', ['email' => 'not-an-email', 'phone' => 'call me'])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['fields' => ['first_name', 'last_name', 'email', 'phone', 'password']]]);

        $this->client()->post('/api/v1/auth/register', $this->form(['first_name' => '<script>alert(1)</script>']))
            ->assertStatus(422)
            ->assertJsonPath('error.fields.first_name.0', 'Use letters only in your first name.');
    }

    public function test_sign_ups_are_rate_limited_per_address(): void
    {
        $browser = $this->client();
        foreach (range(1, 8) as $i) {
            $browser->post('/api/v1/auth/register', $this->form(['email' => "buyer{$i}@example.com"]))->assertCreated();
        }
        $browser->post('/api/v1/auth/register', $this->form(['email' => 'buyer9@example.com']))
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'TOO_MANY_REQUESTS');
    }
}
