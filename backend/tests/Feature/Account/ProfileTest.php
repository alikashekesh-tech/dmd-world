<?php

namespace Tests\Feature\Account;

use App\Models\User;
use App\Notifications\EmailChanged;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_buyer_reads_and_edits_their_own_details(): void
    {
        $user = User::factory()->create(['first_name' => 'Rima']);
        $browser = $this->buyer($user);

        $browser->get('/api/v1/account')->assertOk()->assertJsonPath('data.first_name', 'Rima');
        $browser->patch('/api/v1/account', ['first_name' => 'Rima-Maria', 'phone' => '+961 3 111 222', 'marketing_opt_in' => true])
            ->assertOk()->assertJsonPath('data.first_name', 'Rima-Maria')->assertJsonPath('data.marketing_opt_in', true);
        $this->assertSame('+961 3 111 222', $user->fresh()->phone);

        $browser->patch('/api/v1/account', ['phone' => 'call me maybe'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['phone']]]);
        $browser->patch('/api/v1/account', ['last_name' => '<img src=x onerror=alert(1)>'])->assertStatus(422);
    }

    public function test_fields_a_buyer_must_not_set_are_ignored(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $hash = $user->password;

        $this->buyer($user)->patch('/api/v1/account', ['id' => $other->id, 'password' => 'Hacked-Pass-1!', 'email_verified_at' => null, 'first_name' => 'Same'])->assertOk()->assertJsonPath('data.id', $user->id);

        $this->assertSame($hash, $user->fresh()->password, 'the password only changes through the password endpoints');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertNotSame('Same', $other->fresh()->first_name);
    }

    public function test_changing_the_sign_in_email_needs_the_current_password_and_tells_the_old_address(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'old@example.com']);
        $browser = $this->buyer($user);

        $browser->patch('/api/v1/account', ['email' => 'new@example.com'])->assertStatus(422)->assertJsonPath('error.code', 'WRONG_PASSWORD');
        $browser->patch('/api/v1/account', ['email' => 'new@example.com', 'current_password' => 'Wrong-Pass-1!'])->assertStatus(422);
        $this->assertSame('old@example.com', $user->fresh()->email);

        $browser->patch('/api/v1/account', ['email' => ' New@Example.com ', 'current_password' => UserFactory::DEFAULT_PASSWORD])
            ->assertOk()->assertJsonPath('data.email', 'new@example.com')->assertJsonPath('data.email_verified', false);
        Notification::assertSentTo(new AnonymousNotifiable, EmailChanged::class, fn ($n, $channels, $notifiable) => $notifiable->routes['mail'] === 'old@example.com');

        $this->client()->post('/api/v1/auth/login', ['email' => 'old@example.com', 'password' => UserFactory::DEFAULT_PASSWORD])->assertUnauthorized();
        $this->client()->post('/api/v1/auth/login', ['email' => 'new@example.com', 'password' => UserFactory::DEFAULT_PASSWORD])->assertOk();
    }

    public function test_an_email_already_in_use_is_refused(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        $this->buyer()->patch('/api/v1/account', ['email' => 'TAKEN@example.com', 'current_password' => UserFactory::DEFAULT_PASSWORD])
            ->assertStatus(409)->assertJsonPath('error.code', 'EMAIL_ALREADY_EXISTS');
    }

    public function test_signed_out_visitors_and_the_owner_have_no_buyer_profile(): void
    {
        $this->client()->get('/api/v1/account')->assertUnauthorized();
        $this->client()->patch('/api/v1/account', ['first_name' => 'X'])->assertUnauthorized();
        $this->owner()->get('/api/v1/account')->assertUnauthorized();
    }
}
