<?php

namespace App\Console\Commands;

use App\Models\Admin;
use App\Models\User;
use App\Rules\StrongPassword;
use App\Support\Secrets;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The store owner's account, managed on the server only (there is no sign-up or email reset for it).
 *
 *   php artisan dmd:owner                    create the owner (asks for email and password)
 *   php artisan dmd:owner --reset            change the owner's email, name or password
 *   php artisan dmd:owner --local-test       development only: generated password saved to a local file
 *
 * Passwords are typed at a hidden prompt, stored only as a hash and never printed.
 */
class ManageOwner extends Command
{
    protected $signature = 'dmd:owner
        {--email= : The owner’s sign-in email}
        {--name= : The name shown in the admin}
        {--reset : Change the existing owner’s email, name or password}
        {--local-test : Development only: generate a password and save it in storage/app/private/local-owner-login.txt}';

    protected $description = 'Create the DMD World owner account, or reset its email and password';

    public const LOCAL_FILE = 'app/private/local-owner-login.txt';

    public function handle(): int
    {
        $owner = Admin::owner();
        $local = (bool) $this->option('local-test');

        if ($local && ! $this->laravel->environment('local')) {
            $this->error('--local-test only works with APP_ENV=local. Use php artisan dmd:owner for a real owner.');

            return self::FAILURE;
        }
        if ($owner && ! $this->option('reset') && ! $local) {
            $this->error("The store already has an owner ({$owner->email}). There can only be one: use --reset to change their email or password.");

            return self::FAILURE;
        }
        if (! $owner && $this->option('reset')) {
            $this->error('There is no owner yet. Run php artisan dmd:owner to create one.');

            return self::FAILURE;
        }

        $email = User::normalizeEmail($this->option('email') ?: ($local && $owner ? $owner->email : $this->ask('Owner email', $owner?->email)));
        if (Validator::make(['email' => $email], ['email' => ['required', 'email:rfc', 'max:254']])->fails()) {
            $this->error('Enter a valid email address.');

            return self::FAILURE;
        }
        $name = trim((string) ($this->option('name') ?: ($local ? ($owner->name ?? 'DMD World') : $this->ask('Name shown in the admin', $owner->name ?? 'DMD World'))));
        $name = Str::limit($name !== '' ? $name : 'DMD World', 80, '');

        if ($local) {
            $password = Secrets::password(24);
        } else {
            $password = (string) $this->secret('Password (hidden)');
            if ($password !== (string) $this->secret('Repeat the password')) {
                $this->error('The two passwords don’t match. Nothing was changed.');

                return self::FAILURE;
            }
            if ($problem = StrongPassword::problem($password)) {
                $this->error($problem.' Nothing was changed.');

                return self::FAILURE;
            }
        }

        if ($owner) {
            // A new password hash and remember token sign the owner out everywhere.
            $owner->forceFill(['name' => $name, 'email' => $email, 'password' => $password, 'remember_token' => Str::random(60)])->save();
        } else {
            $owner = Admin::create(['name' => $name, 'email' => $email, 'password' => $password]);
        }

        if ($local) {
            $file = storage_path(self::LOCAL_FILE);
            File::ensureDirectoryExists(dirname($file));
            File::put($file, "DMD World local owner login (APP_ENV=local only; this file is not committed).\n\nAdmin:    ".config('dmd.admin_url')."/\nEmail:    {$email}\nPassword: {$password}\n\nCreate a real owner on a server with: php artisan dmd:owner\n");
            $this->info("Owner {$email} is ready. The password was saved to storage/".self::LOCAL_FILE.'.');

            return self::SUCCESS;
        }

        $this->info($this->option('reset') ? "Owner updated: {$email}. Every signed-in owner device was signed out." : "Owner created: {$email}.");

        return self::SUCCESS;
    }
}
