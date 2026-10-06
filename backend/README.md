# DMD World API (Laravel)

The backend for the DMD World storefront and owner admin (the React apps at the project root). It is Laravel 13 on PHP 8.4 with MySQL, which is the single source of truth for the store's data. The migration plan and schema are in [`../docs/laravel-migration.md`](../docs/laravel-migration.md).

## Setup (once)

Requirements: PHP 8.4 (Laravel Herd provides it, with Composer) and MySQL 8 or newer running locally.

```bash
cd backend
composer install
cp .env.example .env          # skip if .env already exists
php artisan key:generate      # skip if APP_KEY is already set
php artisan db:provision      # asks for your MySQL root password (not stored)
php artisan migrate
```

`db:provision` creates two databases and one account, all named from `.env`:
- **`dmd_world`:** the app's database.
- **`dmd_world_testing`:** the test suite's database, wiped on every run.
- **`dmd_world` account:** has rights on those two databases only. If `DB_PASSWORD` is empty, a strong password is generated into `.env`.

## Run

```bash
npm run api:serve      # from the project root: Laravel on http://127.0.0.1:8000
npm run dev            # the storefront and admin on http://localhost:5173
```

The Vite dev server forwards `/api/v1/*` and `/storage/*` to Laravel, so the browser only ever talks to its own origin. Cookie sessions and CSRF work the same as in production, and no CORS is needed.

Create the owner account once: `php artisan dmd:owner`.

## Test

```bash
npm test               # or, inside backend/: php artisan test
```

Tests run against MySQL (the same engine as production) in the `*_testing` database. The suite refuses to start against any other database name.

## Conventions

- **Routes:** `routes/api.php` serves `/api/v1` (storefront and buyers); `routes/admin.php` serves `/api/v1/admin` on the `admin` guard.
- **Errors:** always `{"error": {"code": "SOME_CODE", "message": "Readable sentence.", "fields": {...}}}`. To refuse something for a business reason, throw `App\Exceptions\ApiException`. Framework and database messages are never sent to clients; they go to `storage/logs`.
- **Authentication:** Sanctum SPA cookie sessions only. Bearer tokens are disabled.
- **Validation:** Form Requests. **Responses:** API Resources. **Ownership:** Policies. **Services:** only for logic shared across endpoints (pricing, checkout, inventory).
- **Secrets:** only in `.env` (never committed). The React apps receive none of them.

## Commands

| Command | What it does |
|---|---|
| `php artisan db:provision` | creates the databases and the app's MySQL account (asks for the root password, never stores it) |
| `php artisan dmd:owner` | creates the owner account (`--reset` changes its password) |
| `php artisan dmd:import` | one-time copy of the old WooCommerce store (read-only; `--only=` for parts; refuses production without `--force`) |
| `php artisan dmd:verify-import` | checks every record of the old store against MySQL |
| `php artisan dmd:import-media` | copies images still served by the old WordPress site into storage (`--dry-run` to count) |
| `php artisan dmd:stock-alerts` | retries back-in-stock emails a mail failure left behind (scheduled every 10 minutes) |

Production setup, the go-live import and backups: [`../docs/deployment.md`](../docs/deployment.md).
