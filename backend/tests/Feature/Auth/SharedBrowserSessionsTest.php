<?php

namespace Tests\Feature\Auth;

use App\Models\Admin;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * One browser, signed in to the admin as the owner and (maybe) to the storefront as a buyer. The browser has one
 * session cookie; each guard keeps its own sign-in inside it, and neither may create, change or end the other's.
 */
class SharedBrowserSessionsTest extends TestCase
{
    use RefreshDatabase;

    private function ownerIn(SpaClient $browser): void
    {
        Admin::owner() ?? Admin::create(['name' => 'DMD World', 'email' => 'owner@dmdworld.test', 'password' => self::OWNER_PASSWORD]);
        $browser->post('/api/v1/admin/auth/login', ['email' => 'owner@dmdworld.test', 'password' => self::OWNER_PASSWORD])->assertOk();
    }

    private function buyerIn(SpaClient $browser, User $user): void
    {
        $browser->post('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::DEFAULT_PASSWORD])->assertOk();
    }

    /** The session id inside the browser's (encrypted, re-encrypted on every answer) session cookie. */
    private function sessionId(SpaClient $browser): string
    {
        $name = config('session.cookie');

        return CookieValuePrefix::remove(Crypt::decrypt($browser->cookies[$name], false));
    }

    /** What the storefront asks for when its home page opens ("View home page" in the admin). */
    private function openStorefront(SpaClient $browser): void
    {
        $browser->get('/api/v1/sanctum/csrf-cookie')->assertNoContent();
        $browser->get('/api/v1/catalog')->assertOk();
        $browser->get('/api/v1/auth/me');
    }

    public function test_the_owner_alone_sees_a_signed_out_storefront(): void
    {
        $browser = $this->client();
        $this->ownerIn($browser);

        $this->openStorefront($browser);

        $browser->get('/api/v1/auth/me')->assertUnauthorized();          // no buyer session was created
        $browser->get('/api/v1/wishlist')->assertUnauthorized();         // nor any buyer access from the owner
        $browser->get('/api/v1/admin/auth/me')->assertOk();              // the owner is still signed in
        $this->assertSame(0, User::query()->count(), 'opening the storefront creates no buyer');
    }

    public function test_an_existing_buyer_session_is_shown_unchanged(): void
    {
        $buyerA = User::factory()->create();
        $browser = $this->client();
        $this->buyerIn($browser, $buyerA);
        $this->ownerIn($browser);
        $sessionBefore = $this->sessionId($browser);

        $this->openStorefront($browser);

        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $buyerA->id)->assertJsonPath('data.email', $buyerA->email);
        $this->assertSame($sessionBefore, $this->sessionId($browser), 'browsing the storefront keeps the same session');
        $browser->get('/api/v1/admin/auth/me')->assertOk()->assertJsonPath('data.email', 'owner@dmdworld.test');
    }

    public function test_signing_the_buyer_out_keeps_the_owner_signed_in(): void
    {
        $browser = $this->client();
        $this->buyerIn($browser, User::factory()->create());
        $this->ownerIn($browser);

        $browser->post('/api/v1/auth/logout')->assertNoContent();

        $browser->get('/api/v1/auth/me')->assertUnauthorized();
        $browser->get('/api/v1/admin/auth/me')->assertOk();
    }

    public function test_signing_the_owner_out_keeps_the_buyer_signed_in(): void
    {
        $buyerA = User::factory()->create();
        $browser = $this->client();
        $this->buyerIn($browser, $buyerA);
        $this->ownerIn($browser);

        $browser->post('/api/v1/admin/auth/logout')->assertNoContent();

        $browser->get('/api/v1/admin/auth/me')->assertUnauthorized();
        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $buyerA->id);
    }

    public function test_the_owner_signed_out_elsewhere_by_a_password_change_leaves_the_buyer_signed_in(): void
    {
        // Without "remember me", so the buyer can only still be signed in if their sign-in itself survived (with it,
        // the remember cookie would sign them back in and hide the problem).
        $buyerA = User::factory()->create();
        $browser = $this->client();
        $browser->post('/api/v1/auth/login', ['email' => $buyerA->email, 'password' => UserFactory::DEFAULT_PASSWORD, 'remember' => false])->assertOk();
        $this->ownerIn($browser);
        $laptop = $this->client();
        $this->ownerIn($laptop);

        $laptop->put('/api/v1/admin/auth/password', ['current_password' => self::OWNER_PASSWORD, 'password' => 'New-Owner-Pass-9', 'password_confirmation' => 'New-Owner-Pass-9'])->assertOk();

        $browser->get('/api/v1/admin/auth/me')->assertUnauthorized();   // the owner's old session ends, as it should
        $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $buyerA->id); // the buyer's does not
    }
}
