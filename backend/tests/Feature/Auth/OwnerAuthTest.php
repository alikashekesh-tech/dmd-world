<?php

namespace Tests\Feature\Auth;

use App\Models\Admin;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerAuthTest extends TestCase
{
    use RefreshDatabase;

    private function makeOwner(string $email = 'owner@dmdworld.test'): Admin
    {
        return Admin::create(['name' => 'DMD World', 'email' => $email, 'password' => self::OWNER_PASSWORD]);
    }

    public function test_the_owner_signs_in_reads_me_and_signs_out(): void
    {
        $this->makeOwner();
        $browser = $this->client();

        $browser->post('/api/v1/admin/auth/login', ['email' => 'Owner@DMDWorld.test', 'password' => self::OWNER_PASSWORD])
            ->assertOk()->assertJsonPath('data.email', 'owner@dmdworld.test')->assertJsonMissingPath('data.password');
        $browser->get('/api/v1/admin/auth/me')->assertOk();

        $browser->post('/api/v1/admin/auth/logout')->assertNoContent();
        $browser->get('/api/v1/admin/auth/me')->assertUnauthorized();
    }

    public function test_a_wrong_owner_password_is_refused_and_limited(): void
    {
        $this->makeOwner();
        $attacker = $this->client('203.0.113.50');
        foreach (range(1, 5) as $i) {
            $attacker->post('/api/v1/admin/auth/login', ['email' => 'owner@dmdworld.test', 'password' => "Guess-{$i}-x!"])->assertUnauthorized();
        }
        $attacker->post('/api/v1/admin/auth/login', ['email' => 'owner@dmdworld.test', 'password' => self::OWNER_PASSWORD])->assertStatus(429);
    }

    public function test_a_buyer_session_is_never_accepted_by_the_admin_api(): void
    {
        $this->makeOwner();
        $buyer = $this->buyer();

        $buyer->get('/api/v1/admin/auth/me')->assertUnauthorized();
        $buyer->put('/api/v1/admin/auth/password', ['current_password' => UserFactory::DEFAULT_PASSWORD, 'password' => 'New-Owner-Pass-9', 'password_confirmation' => 'New-Owner-Pass-9'])->assertUnauthorized();
    }

    public function test_buyer_credentials_do_not_open_the_admin_even_with_the_same_email(): void
    {
        $this->makeOwner('shared@example.com');
        User::factory()->create(['email' => 'shared@example.com']);

        $this->client()->post('/api/v1/admin/auth/login', ['email' => 'shared@example.com', 'password' => UserFactory::DEFAULT_PASSWORD])->assertUnauthorized();
        $this->client()->post('/api/v1/auth/login', ['email' => 'shared@example.com', 'password' => self::OWNER_PASSWORD])->assertUnauthorized();
    }

    public function test_the_owner_is_not_a_buyer(): void
    {
        $this->makeOwner();
        $owner = $this->owner();

        $owner->get('/api/v1/auth/me')->assertUnauthorized();
        $this->assertSame(0, User::count(), 'signing in as the owner creates no buyer account');
    }

    public function test_owner_and_buyer_sessions_in_one_browser_stay_independent(): void
    {
        $this->makeOwner();
        $user = User::factory()->create();
        $browser = $this->client();
        $browser->post('/api/v1/admin/auth/login', ['email' => 'owner@dmdworld.test', 'password' => self::OWNER_PASSWORD])->assertOk();
        $browser->post('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::DEFAULT_PASSWORD])->assertOk();

        $browser->get('/api/v1/admin/auth/me')->assertOk();
        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);

        $browser->post('/api/v1/auth/logout')->assertNoContent();
        $browser->get('/api/v1/auth/me')->assertUnauthorized();
        $browser->get('/api/v1/admin/auth/me')->assertOk();
    }

    public function test_the_owner_changes_their_password_and_other_owner_devices_sign_out(): void
    {
        $this->makeOwner();
        $desk = $this->owner();
        $phone = $this->owner();

        $desk->put('/api/v1/admin/auth/password', ['current_password' => 'Wrong-Pass-1!', 'password' => 'New-Owner-Pass-9', 'password_confirmation' => 'New-Owner-Pass-9'])
            ->assertStatus(422)->assertJsonPath('error.code', 'WRONG_PASSWORD');
        $desk->put('/api/v1/admin/auth/password', ['current_password' => self::OWNER_PASSWORD, 'password' => 'New-Owner-Pass-9', 'password_confirmation' => 'New-Owner-Pass-9'])->assertOk();

        $desk->get('/api/v1/admin/auth/me')->assertOk();
        $phone->get('/api/v1/admin/auth/me')->assertUnauthorized();
        $this->assertTrue(Hash::check('New-Owner-Pass-9', Admin::owner()->password));
    }

    public function test_the_database_refuses_a_second_owner(): void
    {
        $this->makeOwner();

        $this->expectException(UniqueConstraintViolationException::class);
        Admin::create(['name' => 'Intruder', 'email' => 'second@example.com', 'password' => self::OWNER_PASSWORD]);
    }
}
