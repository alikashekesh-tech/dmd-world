<?php

namespace Tests\Feature\Admin;

use App\Models\Admin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'Staff-pass-2026';

    private function staffLogin(string $email, string $password = self::PASSWORD)
    {
        return $this->client()->post('/api/v1/admin/auth/login', ['email' => $email, 'password' => $password]);
    }

    public function test_the_owner_adds_staff_who_run_the_shop_but_not_the_settings(): void
    {
        $owner = $this->owner();
        $owner->get('/api/v1/admin/auth/me')->assertJsonPath('data.role', 'owner');

        $owner->post('/api/v1/admin/staff', ['name' => 'Rami', 'email' => ' Rami@DMDworld.store ', 'password' => self::PASSWORD])
            ->assertCreated()->assertJsonPath('data.role', 'staff')->assertJsonPath('data.email', 'rami@dmdworld.store');
        $this->assertSame(['owner', 'staff'], array_column($owner->get('/api/v1/admin/staff')->assertOk()->json('data'), 'role'));

        $staff = $this->client();
        $staff->post('/api/v1/admin/auth/login', ['email' => 'rami@dmdworld.store', 'password' => self::PASSWORD])->assertOk()->assertJsonPath('data.role', 'staff');
        $staff->get('/api/v1/admin/products')->assertOk();
        $staff->get('/api/v1/admin/orders')->assertOk();
        $staff->get('/api/v1/admin/settings')->assertOk();

        $staff->put('/api/v1/admin/settings', ['store_name' => 'Taken over'])->assertForbidden()->assertJsonPath('error.code', 'OWNER_ONLY');
        $staff->get('/api/v1/admin/staff')->assertForbidden();
        $staff->post('/api/v1/admin/staff', ['name' => 'Friend', 'email' => 'friend@example.com', 'password' => self::PASSWORD])->assertForbidden();
        $this->assertSame(2, Admin::count());

        // Staff change their own password like the owner does.
        $staff->put('/api/v1/admin/auth/password', ['current_password' => self::PASSWORD, 'password' => 'Brand-new-2026', 'password_confirmation' => 'Brand-new-2026'])->assertOk();
    }

    public function test_staff_details_are_checked(): void
    {
        $owner = $this->owner();
        $ownerEmail = Admin::owner()->email;
        $owner->post('/api/v1/admin/staff', ['name' => 'Copy', 'email' => $ownerEmail, 'password' => self::PASSWORD])
            ->assertStatus(422)->assertJsonPath('error.fields.email.0', 'Someone in the admin already uses this email.');
        $owner->post('/api/v1/admin/staff', ['name' => 'Weak', 'email' => 'weak@example.com', 'password' => 'password'])->assertStatus(422);
        $owner->post('/api/v1/admin/staff', ['name' => '<b>x</b>', 'email' => 'x@example.com', 'password' => self::PASSWORD])->assertStatus(422);
        $this->assertSame(1, Admin::count());
    }

    public function test_a_new_password_or_removal_signs_staff_out_at_once(): void
    {
        $owner = $this->owner();
        $id = $owner->post('/api/v1/admin/staff', ['name' => 'Rami', 'email' => 'rami@dmdworld.store', 'password' => self::PASSWORD])->json('data.id');
        $staff = $this->client();
        $staff->post('/api/v1/admin/auth/login', ['email' => 'rami@dmdworld.store', 'password' => self::PASSWORD])->assertOk();

        $owner->put("/api/v1/admin/staff/{$id}/password", ['password' => 'Reset-pass-2026'])->assertOk();
        $staff->get('/api/v1/admin/products')->assertUnauthorized();
        $this->staffLogin('rami@dmdworld.store')->assertUnauthorized();
        $again = $this->client();
        $again->post('/api/v1/admin/auth/login', ['email' => 'rami@dmdworld.store', 'password' => 'Reset-pass-2026'])->assertOk();

        $owner->delete("/api/v1/admin/staff/{$id}")->assertNoContent();
        $again->get('/api/v1/admin/products')->assertUnauthorized();
        $this->staffLogin('rami@dmdworld.store', 'Reset-pass-2026')->assertUnauthorized();
        $this->assertNull(Admin::find($id));
    }

    public function test_the_owner_account_cannot_be_reset_or_removed_from_the_staff_list(): void
    {
        $owner = $this->owner();
        $ownerId = Admin::owner()->id;
        $owner->put("/api/v1/admin/staff/{$ownerId}/password", ['password' => 'Reset-pass-2026'])->assertStatus(422)->assertJsonPath('error.code', 'OWNER_ACCOUNT');
        $owner->delete("/api/v1/admin/staff/{$ownerId}")->assertStatus(422);
        $this->assertNotNull(Admin::owner());
    }
}
