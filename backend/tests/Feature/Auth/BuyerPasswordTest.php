<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BuyerPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const NEW = 'Brand-New-Pass-7';

    public function test_changing_the_password_needs_the_current_one(): void
    {
        $user = User::factory()->create();
        $browser = $this->buyer($user);

        $browser->put('/api/v1/auth/password', ['current_password' => 'Not-It-1!', 'password' => self::NEW, 'password_confirmation' => self::NEW])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'WRONG_PASSWORD');
        $this->assertTrue(Hash::check(UserFactory::DEFAULT_PASSWORD, $user->fresh()->password));
    }

    public function test_the_new_password_must_be_strong_and_different(): void
    {
        $browser = $this->buyer();

        $browser->put('/api/v1/auth/password', ['current_password' => UserFactory::DEFAULT_PASSWORD, 'password' => 'weakpass', 'password_confirmation' => 'weakpass'])
            ->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['password']]]);
        $browser->put('/api/v1/auth/password', ['current_password' => UserFactory::DEFAULT_PASSWORD, 'password' => UserFactory::DEFAULT_PASSWORD, 'password_confirmation' => UserFactory::DEFAULT_PASSWORD])
            ->assertStatus(422)->assertJsonPath('error.fields.password.0', 'Choose a password that’s different from your current one.');
    }

    public function test_a_password_change_signs_out_every_other_device_but_not_this_one(): void
    {
        $user = User::factory()->create();
        $phone = $this->buyer($user);
        $laptop = $this->buyer($user);

        $laptop->put('/api/v1/auth/password', ['current_password' => UserFactory::DEFAULT_PASSWORD, 'password' => self::NEW, 'password_confirmation' => self::NEW])->assertOk();

        $laptop->get('/api/v1/auth/me')->assertOk();
        $phone->get('/api/v1/auth/me')->assertUnauthorized();
        $phone->closeBrowser(); // its remember-me cookie was revoked too
        $phone->get('/api/v1/auth/me')->assertUnauthorized();

        $this->client()->post('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::DEFAULT_PASSWORD])->assertUnauthorized();
        $this->client()->post('/api/v1/auth/login', ['email' => $user->email, 'password' => self::NEW])->assertOk();
    }

    public function test_wrong_current_passwords_are_limited_even_with_a_valid_session(): void
    {
        $browser = $this->buyer();
        foreach (range(1, 5) as $i) {
            $browser->put('/api/v1/auth/password', ['current_password' => "Guess-{$i}-x!", 'password' => self::NEW, 'password_confirmation' => self::NEW])->assertStatus(422);
        }
        $browser->put('/api/v1/auth/password', ['current_password' => UserFactory::DEFAULT_PASSWORD, 'password' => self::NEW, 'password_confirmation' => self::NEW])
            ->assertStatus(429);
    }

    public function test_forgot_password_answers_the_same_for_unknown_emails_and_only_mails_real_accounts(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'maya@example.com']);

        $known = $this->client()->post('/api/v1/auth/forgot-password', ['email' => 'Maya@Example.com'])->assertOk();
        $unknown = $this->client()->post('/api/v1/auth/forgot-password', ['email' => 'ghost@example.com'])->assertOk();

        $this->assertSame(str_replace('maya@example.com', 'X', $known->json('message')), str_replace('ghost@example.com', 'X', $unknown->json('message')));
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use ($user) {
            $url = $n->toMail($user)->actionUrl;

            return str_starts_with($url, config('dmd.frontend_url').'/account/reset?') && str_contains($url, 'token=');
        });
        Notification::assertSentTimes(ResetPassword::class, 1);
    }

    public function test_a_reset_link_sets_a_new_password_signs_in_and_works_only_once(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $other = $this->buyer($user); // already signed in somewhere
        $this->client()->post('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $browser = $this->client();
        $browser->post('/api/v1/auth/reset-password/check', ['email' => $user->email, 'token' => $token])->assertOk()->assertJson(['valid' => true]);
        $browser->post('/api/v1/auth/reset-password/check', ['email' => $user->email, 'token' => 'forged'])->assertOk()->assertJson(['valid' => false]);
        $browser->post('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => self::NEW, 'password_confirmation' => self::NEW])
            ->assertOk()->assertJsonPath('data.id', $user->id);
        $browser->get('/api/v1/auth/me')->assertOk();

        $this->assertTrue(Hash::check(self::NEW, $user->fresh()->password));
        $other->get('/api/v1/auth/me')->assertUnauthorized();

        $this->client()->post('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'Another-Pass-8', 'password_confirmation' => 'Another-Pass-8'])
            ->assertStatus(422)->assertJsonPath('error.code', 'RESET_LINK_INVALID');
    }

    public function test_an_imported_customer_can_choose_a_first_password_by_reset(): void
    {
        Notification::fake();
        $user = User::factory()->withoutPassword()->create();
        $this->client()->post('/api/v1/auth/forgot-password', ['email' => $user->email]);
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $this->client()->post('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => self::NEW, 'password_confirmation' => self::NEW])->assertOk();
        $this->client()->post('/api/v1/auth/login', ['email' => $user->email, 'password' => self::NEW])->assertOk();
    }

    public function test_reset_requests_are_limited_per_email(): void
    {
        Notification::fake();
        User::factory()->create(['email' => 'flood@example.com']);
        foreach (range(1, 3) as $i) {
            $this->client()->post('/api/v1/auth/forgot-password', ['email' => 'flood@example.com'])->assertOk();
        }
        $this->client()->post('/api/v1/auth/forgot-password', ['email' => 'flood@example.com'])->assertStatus(429);
    }
}
