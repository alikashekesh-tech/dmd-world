<?php

namespace App\Console\Commands;

use App\Support\Secrets;
use Illuminate\Console\Command;
use PDO;
use Throwable;

/**
 * One-time local setup: creates the app database, the test database and a dedicated MySQL account for DMD World,
 * from the DB_* values in .env. The MySQL admin password is asked for interactively and never stored.
 *
 *   php artisan db:provision                     (prompts for the root password)
 *   php artisan db:provision --no-admin-password (a fresh install whose root has no password yet)
 */
class ProvisionDatabase extends Command
{
    protected $signature = 'db:provision
        {--admin-user=root : A MySQL account that may create databases and users}
        {--no-admin-password : The admin account has no password (fresh local installs only)}
        {--host= : MySQL host (default: DB_HOST)}
        {--port= : MySQL port (default: DB_PORT)}';

    protected $description = 'Create the DMD World MySQL databases (app and tests) and the app’s own MySQL user';

    private const RESERVED_USERS = ['root', 'mysql.sys', 'mysql.session', 'mysql.infoschema'];

    public function handle(): int
    {
        if (config('database.default') !== 'mysql') {
            $this->error('DB_CONNECTION must be mysql.');

            return self::FAILURE;
        }

        $c = config('database.connections.mysql');
        $host = (string) ($this->option('host') ?: $c['host']);
        $port = (int) ($this->option('port') ?: $c['port']);
        $database = (string) $c['database'];
        $testing = (string) (config('dmd.testing_database') ?: $database.'_testing');
        $user = (string) $c['username'];

        // Identifiers can't be bound as query parameters, so only plain names are accepted.
        foreach ([$database, $testing] as $name) {
            if (! preg_match('/^[A-Za-z0-9_]{1,64}$/', $name)) {
                $this->error("Database name [{$name}] may only use letters, numbers and underscores.");

                return self::FAILURE;
            }
        }
        if ($database === $testing || ! str_ends_with($testing, '_testing')) {
            $this->error('The test database must be separate from the app database and end in _testing.');

            return self::FAILURE;
        }
        if (! preg_match('/^[A-Za-z0-9_]{1,32}$/', $user) || in_array(strtolower($user), self::RESERVED_USERS, true)) {
            $this->error('Set DB_USERNAME to a dedicated account name (letters, numbers, underscores; not root).');

            return self::FAILURE;
        }

        $password = (string) $c['password'];
        if ($password === '') {
            $password = self::generatePassword();
            $this->writeEnv('DB_PASSWORD', $password);
            $this->info("Generated a password for {$user} and saved it in .env (DB_PASSWORD).");
        }

        $adminUser = (string) $this->option('admin-user');
        $adminPassword = $this->option('no-admin-password') ? '' : (string) $this->secret("MySQL password for {$adminUser} on {$host}:{$port}");

        try {
            $pdo = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $adminUser, $adminPassword, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
        } catch (Throwable $e) {
            $this->error("Couldn’t sign in to MySQL as {$adminUser}: ".$e->getMessage());

            return self::FAILURE;
        }

        try {
            foreach ([$database, $testing] as $db) {
                $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
            foreach (['localhost', '127.0.0.1'] as $from) {
                $account = $pdo->quote($user).'@'.$pdo->quote($from);
                $pdo->exec("CREATE USER IF NOT EXISTS {$account} IDENTIFIED BY ".$pdo->quote($password));
                $pdo->exec("ALTER USER {$account} IDENTIFIED BY ".$pdo->quote($password));
                foreach ([$database, $testing] as $db) {
                    $pdo->exec("GRANT ALL PRIVILEGES ON `{$db}`.* TO {$account}");
                }
            }
        } catch (Throwable $e) {
            $this->error('MySQL refused: '.$e->getMessage());

            return self::FAILURE;
        }

        // Prove the app's own account works on both databases before declaring success.
        foreach ([$database, $testing] as $db) {
            try {
                $check = new PDO("mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4", $user, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
                $check->query('select 1');
            } catch (Throwable $e) {
                $this->error("The {$user} account can’t open {$db}: ".$e->getMessage());

                return self::FAILURE;
            }
        }

        $this->info("Ready: databases {$database} and {$testing}, account {$user} (password in .env).");
        $this->line('Next: php artisan migrate');

        return self::SUCCESS;
    }

    /** 32 characters with upper and lower case, digits and a symbol (satisfies MySQL's validate_password). */
    public static function generatePassword(int $length = 32): string
    {
        return Secrets::password($length);
    }

    private function writeEnv(string $key, string $value): void
    {
        $file = $this->laravel->environmentFilePath();
        $env = is_file($file) ? (string) file_get_contents($file) : '';
        $line = "{$key}={$value}";
        $pattern = '/^'.preg_quote($key, '/').'=.*$/m';
        $env = preg_match($pattern, $env) ? preg_replace_callback($pattern, fn () => $line, $env) : rtrim($env)."\n{$line}\n";
        file_put_contents($file, $env);
        config(['database.connections.mysql.password' => $value]);
    }
}
