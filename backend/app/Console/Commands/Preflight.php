<?php

namespace App\Console\Commands;

use App\Models\Admin;
use Illuminate\Console\Command;
use Illuminate\Database\Migrations\Migrator;
use Throwable;

/**
 * Before go-live and after every `.env` change on the server: checks the settings that make production safe and
 * honest (no debug pages, cookies only over HTTPS, real emails, the app's own MySQL account, the owner account,
 * migrations applied). Reads the effective configuration, so it also checks a cached config. Fails on any problem.
 */
class Preflight extends Command
{
    protected $signature = 'dmd:preflight';

    protected $description = 'Check that this installation is configured safely for production';

    /** @var list<array{string, string}> */
    private array $rows = [];

    public function handle(Migrator $migrator): int
    {
        $https = fn (?string $url) => str_starts_with((string) $url, 'https://');
        // As Sanctum compares it: the host, with the port when the address has one ("127.0.0.1:5173").
        $host = fn (?string $url) => strtolower((string) parse_url((string) $url, PHP_URL_HOST)).(($port = parse_url((string) $url, PHP_URL_PORT)) ? ":{$port}" : '');
        $stateful = array_map('strtolower', (array) config('sanctum.stateful'));
        $frontendHost = $host(config('dmd.frontend_url'));

        $this->check(config('app.env') === 'production', 'APP_ENV is production', 'APP_ENV is “'.config('app.env').'”');
        $this->check(config('app.debug') === false, 'APP_DEBUG is off', 'APP_DEBUG is on: error pages would show code and settings to anyone');
        $this->check(filled(config('app.key')), 'APP_KEY is set', 'APP_KEY is empty: run php artisan key:generate once and keep it');
        $this->check($https(config('app.url')), 'APP_URL uses https', 'APP_URL is not https');
        $this->check($https(config('dmd.frontend_url')) && $https(config('dmd.admin_url')), 'FRONTEND_URL and ADMIN_URL use https', 'FRONTEND_URL or ADMIN_URL is not https (links in emails)');
        $this->check(config('session.secure') === true, 'session cookies are HTTPS-only', 'SESSION_SECURE_COOKIE is not true: the session cookie would also travel over plain http');
        $this->check(config('session.http_only') === true, 'session cookies are hidden from JavaScript', 'SESSION_HTTP_ONLY is off');
        $this->check(in_array(config('session.same_site'), ['lax', 'strict'], true), 'session cookies are SameSite', 'SESSION_SAME_SITE must be lax or strict');
        $this->check(in_array($frontendHost, $stateful, true), "the storefront ({$frontendHost}) can sign in", 'SANCTUM_STATEFUL_DOMAINS does not list the FRONTEND_URL host: nobody could sign in');
        $this->check(! in_array('*', (array) config('cors.allowed_origins'), true), 'no wildcard CORS origin', 'CORS_ALLOWED_ORIGINS contains *');
        $devOrigins = array_filter((array) config('cors.allowed_origins'), fn ($o) => ! str_starts_with((string) $o, 'https://') || preg_match('#^(localhost|127\.0\.0\.1)(:|$)#', $host($o)));
        $this->check($devOrigins === [], 'CORS lists only https production origins', 'CORS_ALLOWED_ORIGINS lists a development or http origin ('.implode(', ', $devOrigins).'): production leaves it empty');
        $this->check(! in_array(config('mail.default'), ['log', 'array'], true), 'emails are really sent ('.config('mail.default').')', 'MAIL_MAILER is “'.config('mail.default').'”: password resets and order emails would only be written to the log');
        $this->check(config('database.connections.mysql.username') !== 'root', 'the app uses its own MySQL account', 'DB_USERNAME is root: give the app its own account (php artisan db:provision)');

        try {
            $ran = $migrator->getRepository()->getRan();
            $pending = array_diff(array_keys($migrator->getMigrationFiles(database_path('migrations'))), $ran);
            $this->check($pending === [], 'every migration is applied', count($pending).' migration(s) not applied: php artisan migrate --force');
            $this->check(Admin::query()->exists(), 'the owner account exists', 'no owner account: php artisan dmd:owner');
        } catch (Throwable) {
            $this->check(false, '', 'MySQL is not reachable with the DB_* settings');
        }
        foreach ([storage_path('app/public'), storage_path('logs'), base_path('bootstrap/cache')] as $dir) {
            $this->check(is_dir($dir) && is_writable($dir), "{$dir} is writable", "{$dir} is not writable by the web user");
        }

        $this->advise(config('session.encrypt') === true, 'sessions are encrypted', 'SESSION_ENCRYPT is off (sessions are stored in MySQL unencrypted)');
        $this->advise(config('hashing.driver') === 'argon2id', 'passwords are hashed with Argon2id', 'HASH_DRIVER is not argon2id');
        $this->advise(! in_array(config('logging.channels.'.config('logging.default').'.level', 'debug'), ['debug'], true), 'logs skip debug detail', 'LOG_LEVEL is debug');
        $this->advise(array_filter($stateful, fn ($d) => str_starts_with($d, 'localhost') || str_starts_with($d, '127.0.0.1')) === [], 'no development addresses can sign in', 'SANCTUM_STATEFUL_DOMAINS still lists localhost or 127.0.0.1');
        $this->advise(config('dmd.trusted_proxies') !== [], 'the reverse proxy is trusted (real client addresses)', 'TRUSTED_PROXIES is empty: rate limits would see the proxy, not the buyer');
        $this->advise(blank(config('dmd.import.woocommerce.key')), 'no old-store credentials left', 'IMPORT_WOO_* is still set: remove it once the go-live import is done');
        $this->advise($this->laravel->configurationIsCached(), 'the configuration is cached', 'run php artisan config:cache (and again after every .env change)');

        $this->table(['', 'Check'], $this->rows);
        $failed = count(array_filter($this->rows, fn ($r) => $r[0] === 'FAIL'));
        if ($failed) {
            $this->error("{$failed} problem(s) to fix before this installation is used in production.");

            return self::FAILURE;
        }
        $this->info('Ready for production.');

        return self::SUCCESS;
    }

    private function check(bool $ok, string $pass, string $fail): void
    {
        $this->rows[] = $ok ? ['ok', $pass] : ['FAIL', $fail];
    }

    private function advise(bool $ok, string $pass, string $warning): void
    {
        $this->rows[] = $ok ? ['ok', $pass] : ['warn', $warning];
    }
}
