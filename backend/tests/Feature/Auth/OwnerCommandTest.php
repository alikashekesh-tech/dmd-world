<?php

namespace Tests\Feature\Auth;

use App\Models\Admin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerCommandTest extends TestCase
{
    use RefreshDatabase;

    private const PASS = 'Owner-Pass-2026!';

    public function test_it_creates_the_owner_without_ever_printing_the_password(): void
    {
        $this->artisan('dmd:owner', ['--email' => 'Owner@DMDWorld.store', '--name' => 'DMD World'])
            ->expectsQuestion('Password (hidden)', self::PASS)
            ->expectsQuestion('Repeat the password', self::PASS)
            ->expectsOutputToContain('Owner created: owner@dmdworld.store')
            ->doesntExpectOutputToContain(self::PASS)
            ->assertSuccessful();

        $owner = Admin::owner();
        $this->assertSame('owner@dmdworld.store', $owner->email);
        $this->assertTrue(Hash::check(self::PASS, $owner->password));
        $this->assertStringStartsWith('$argon2id$', $owner->password);
    }

    public function test_there_can_only_be_one_owner(): void
    {
        Admin::create(['name' => 'DMD World', 'email' => 'owner@dmdworld.store', 'password' => self::PASS]);

        $this->artisan('dmd:owner', ['--email' => 'second@dmdworld.store'])
            ->expectsOutputToContain('already has an owner')
            ->assertFailed();
        $this->assertSame(1, Admin::count());
    }

    public function test_reset_replaces_the_password_and_email(): void
    {
        Admin::create(['name' => 'DMD World', 'email' => 'owner@dmdworld.store', 'password' => self::PASS]);

        $this->artisan('dmd:owner', ['--reset' => true, '--email' => 'boss@dmdworld.store', '--name' => 'Boss'])
            ->expectsQuestion('Password (hidden)', 'Fresh-Owner-Pass-1')
            ->expectsQuestion('Repeat the password', 'Fresh-Owner-Pass-1')
            ->assertSuccessful();

        $owner = Admin::owner();
        $this->assertSame(['boss@dmdworld.store', 'Boss'], [$owner->email, $owner->name]);
        $this->assertTrue(Hash::check('Fresh-Owner-Pass-1', $owner->password));
        $this->assertSame(1, Admin::count());
    }

    public function test_weak_or_mismatched_passwords_change_nothing(): void
    {
        $this->artisan('dmd:owner', ['--email' => 'owner@dmdworld.store', '--name' => 'DMD'])
            ->expectsQuestion('Password (hidden)', 'password')
            ->expectsQuestion('Repeat the password', 'password')
            ->expectsOutputToContain('The password needs')
            ->assertFailed();

        $this->artisan('dmd:owner', ['--email' => 'owner@dmdworld.store', '--name' => 'DMD'])
            ->expectsQuestion('Password (hidden)', self::PASS)
            ->expectsQuestion('Repeat the password', self::PASS.'x')
            ->expectsOutputToContain('don’t match')
            ->assertFailed();

        $this->assertSame(0, Admin::count());
    }

    public function test_the_local_test_shortcut_refuses_to_run_outside_local_development(): void
    {
        $this->artisan('dmd:owner', ['--local-test' => true, '--email' => 'owner@dmdworld.store'])
            ->expectsOutputToContain('only works with APP_ENV=local')
            ->assertFailed();
        $this->assertSame(0, Admin::count());
    }
}
