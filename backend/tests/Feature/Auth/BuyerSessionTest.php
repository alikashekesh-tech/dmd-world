<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuyerSessionTest extends TestCase
{
    use RefreshDatabase;

    private function login($browser, User $user, string $password = UserFactory::DEFAULT_PASSWORD, array $extra = [])
    {
        return $browser->post('/api/v1/auth/login', ['email' => $user->email, 'password' => $password, ...$extra]);
    }

    public function test_sign_in_with_the_right_password(): void
    {
        $user = User::factory()->create(['email' => 'nadim@example.com']);
        $browser = $this->client();

        $this->login($browser, $user)->assertOk()->assertJsonPath('data.id', $user->id);
        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'nadim@example.com');
    }

    public function test_the_email_is_matched_whatever_its_case(): void
    {
        User::factory()->create(['email' => 'nadim@example.com']);

        $this->client()->post('/api/v1/auth/login', ['email' => ' NADIM@Example.com', 'password' => UserFactory::DEFAULT_PASSWORD])->assertOk();
    }

    public function test_a_wrong_password_or_unknown_email_get_the_same_answer(): void
    {
        $user = User::factory()->create();

        $wrong = $this->login($this->client(), $user, 'Wrong-Pass-1!')->assertUnauthorized()->assertJsonPath('error.code', 'INVALID_CREDENTIALS');
        $unknown = $this->client()->post('/api/v1/auth/login', ['email' => 'nobody@example.com', 'password' => 'Wrong-Pass-1!'])->assertUnauthorized();

        $this->assertSame($wrong->json('error'), $unknown->json('error'));
    }

    public function test_an_imported_customer_without_a_password_cannot_sign_in(): void
    {
        $user = User::factory()->withoutPassword()->create();

        $this->client()->post('/api/v1/auth/login', ['email' => $user->email, 'password' => ''])->assertStatus(422);
        $this->login($this->client(), $user, 'Anything-1!')->assertUnauthorized();
    }

    public function test_me_needs_a_session(): void
    {
        $this->client()->get('/api/v1/auth/me')->assertUnauthorized()->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_signing_in_starts_a_new_session_id(): void
    {
        $user = User::factory()->create();
        $browser = $this->client();
        $browser->get('/api/v1/sanctum/csrf-cookie')->assertNoContent();
        $before = $browser->cookies[config('session.cookie')];

        $this->login($browser, $user)->assertOk();

        $this->assertNotSame($before, $browser->cookies[config('session.cookie')], 'no session fixation');
    }

    public function test_sign_out_ends_the_session_for_good(): void
    {
        $user = User::factory()->create();
        $browser = $this->client();
        $this->login($browser, $user)->assertOk();
        $stolen = $browser->cookies; // what someone copying the cookies before sign-out would have

        $browser->post('/api/v1/auth/logout')->assertNoContent();
        $browser->get('/api/v1/auth/me')->assertUnauthorized();

        $replay = $this->client();
        $replay->cookies = $stolen;
        $replay->get('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_remember_me_keeps_the_buyer_signed_in_after_the_browser_closes(): void
    {
        $user = User::factory()->create();
        $browser = $this->client();
        $this->login($browser, $user)->assertOk();
        $this->assertNotEmpty(array_filter(array_keys($browser->cookies), fn ($k) => str_starts_with($k, 'remember_web_')));

        $browser->closeBrowser();
        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
    }

    public function test_without_remember_me_closing_the_browser_signs_out(): void
    {
        $user = User::factory()->create();
        $browser = $this->client();
        $this->login($browser, $user, extra: ['remember' => false])->assertOk();

        $browser->closeBrowser();
        $browser->get('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_repeated_wrong_passwords_lock_the_account_on_that_connection(): void
    {
        $user = User::factory()->create();
        $attacker = $this->client('203.0.113.9');
        foreach (range(1, 5) as $i) {
            $this->login($attacker, $user, 'Wrong-Pass-1!')->assertUnauthorized();
        }

        // Even the right password is refused for a while from there…
        $this->login($attacker, $user)->assertStatus(429)->assertJsonPath('error.code', 'TOO_MANY_ATTEMPTS')->assertHeader('Retry-After');
        // …while the real buyer, elsewhere, still gets in.
        $this->login($this->client('198.51.100.7'), $user)->assertOk();
    }

    public function test_requests_without_the_spa_origin_get_no_session(): void
    {
        $user = User::factory()->create();

        // A script calling the API directly (no Origin/Referer from the storefront) can't hold a cookie session.
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.9'])
            ->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::DEFAULT_PASSWORD])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'SESSION_REQUIRED');
    }
}
