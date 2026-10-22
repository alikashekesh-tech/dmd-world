# Deploying DMD World

One server runs everything behind Caddy:

```
https://shop.example.com/          storefront   dist/              (static files)
https://shop.example.com/admin/    owner admin  admin/dist/        (static files)
https://shop.example.com/api/v1/*  Laravel API  backend/public     (php-fpm)
https://shop.example.com/storage/* uploads      backend/storage/app/public (static files)
MySQL 8 on the same machine (or a managed instance): the single source of truth.
```

The files are in `deploy/`: `Caddyfile`, the scheduler timer (`dmd-world-scheduler.*`) and the nightly backup (`dmd-backup.sh`, `dmd-world-backup.*`).

## 1. Server

- **PHP 8.4** with php-fpm and the extensions `pdo_mysql`, `mbstring`, `intl`, `bcmath`, `fileinfo`, `gd` (or `imagick`), `sodium`, `openssl`, `zip`, `curl`, `xml`. Composer. In `php.ini`: `expose_php = Off`.
- **MySQL 8.0+** (CHECK constraints are enforced from 8.0.16).
- **Caddy 2** (automatic HTTPS).
- **Node 20+** only to build the two React apps (it can run on the build machine instead).

## 2. Code and dependencies

```bash
git clone … /srv/dmd-world && cd /srv/dmd-world
npm ci && npm run build:all                      # dist/ and admin/dist/
cd backend && composer install --no-dev --optimize-autoloader
```

The web user (`www-data`) needs to write `backend/storage` and `backend/bootstrap/cache` only.

## 3. `backend/.env` (production)

Start from `backend/.env.example`. Never commit it; `chmod 640`, owned by the deploy user, readable by the web group.

| Setting | Production value |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` (true would show error details to anyone) |
| `APP_KEY` | `php artisan key:generate` once; keep it (it signs guest order links and encrypts sessions) |
| `APP_URL` | `https://shop.example.com` |
| `FRONTEND_URL` / `ADMIN_URL` | `https://shop.example.com` / `https://shop.example.com/admin` (links in emails) |
| `SANCTUM_STATEFUL_DOMAINS` | `shop.example.com` |
| `SESSION_SECURE_COOKIE` | `true` (cookies only over HTTPS; when unset it follows `APP_URL`: https means secure) |
| `SESSION_DOMAIN` | `null` (the exact host) |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` (Caddy on the same machine; its address otherwise) |
| `DB_*` | the app's own MySQL account with rights on `dmd_world` only (`php artisan db:provision` creates it) |
| `HASH_DRIVER` | `argon2id` |
| `MAIL_MAILER` + `MAIL_*` | your SMTP provider. Until it is set, emails (resets, confirmations, replies, back-in-stock) are only logged |
| `LOG_LEVEL` | `warning` |
| `STORE_TIMEZONE` | `Asia/Beirut` |
| `IMPORT_WOO_*` | only during the go-live import (step 6); remove afterwards |

## 4. Database and caches

```bash
cd /srv/dmd-world/backend
php artisan migrate --force
php artisan dmd:owner                 # the one owner account (asks for name, email and a strong password)
php artisan config:cache && php artisan route:cache && php artisan event:cache
php artisan dmd:preflight             # must end with "Ready for production."
```

Run `php artisan config:cache` again after every `.env` change, then `php artisan dmd:preflight`.

**`dmd:preflight`** checks the effective configuration and fails on anything unsafe or dishonest:
- **Settings:** debug pages, a missing key, http addresses, cookies that aren't HTTPS-only, HttpOnly and SameSite.
- **Sign-in:** a storefront host Sanctum doesn't list, so nobody could sign in.
- **Access:** a wildcard CORS origin, or the MySQL root account.
- **Emails:** a mailer that only logs them.
- **The install:** pending migrations, no owner account, or storage that can't be written.

It also warns about debug logging, development addresses still allowed to sign in, leftover import credentials and an uncached configuration. `php artisan storage:link` is not needed: Caddy serves `storage/app/public` directly.

## 5. Caddy, scheduler and backups

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile        # set the domain and paths, then: sudo systemctl reload caddy
sudo cp deploy/dmd-world-scheduler.* deploy/dmd-world-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dmd-world-scheduler.timer dmd-world-backup.timer
```

- **Scheduler:** runs `php artisan schedule:run` every minute (today: `dmd:stock-alerts` every 10 minutes, which retries back-in-stock emails a mail failure left behind). No queue worker is needed: emails are sent during the request, after the data is saved.
- **Backups:** `deploy/dmd-backup.sh` dumps MySQL (`--single-transaction`, no shop downtime) and archives the uploads nightly into `/var/backups/dmd-world`, keeping 14 days. Give it its own read-only MySQL account in `/etc/dmd-world/backup.cnf` (see the script) and copy the backups off the server. **Test a restore** on another machine before go-live:

  ```bash
  gunzip -c dmd_world-<stamp>.sql.gz | mysql dmd_world_restore
  ```

  - **The backup account:** `SELECT, SHOW VIEW, TRIGGER, EVENT ON dmd_world.*`. The script dumps with `--set-gtid-purged=OFF`; without it, MySQL 8 asks for the global `RELOAD` or `FLUSH_TABLES` privilege and the dump fails.
  - **The drill already run on the dev data:** the same flags dumped 38 tables (3.5 MB of SQL, 0.4 MB gzipped). They were restored into another database with identical row counts and `CHECKSUM TABLE` for every table.

## 6. Go-live: moving from the old WooCommerce store

The importer only reads (GET) from WooCommerce; a read-only REST key is enough. Put the old store's address and key in `IMPORT_WOO_URL`, `IMPORT_WOO_KEY` and `IMPORT_WOO_SECRET`, then:

```bash
php artisan dmd:import --force          # settings, taxonomy, products, customers, orders, reviews, order notes, coupons
php artisan dmd:verify-import           # every record of the old store checked against MySQL; must end "Every record … is in MySQL."
php artisan dmd:import-media --dry-run  # how many images the old site still serves
php artisan dmd:import-media            # copies them into storage and points every row at the copy
```

- **Customers:** imported accounts have no password (WordPress hashes can't be read through the API). Buyers choose one with “Forgot password”; tell them by email.
- **Order statuses and stock:** taken from the moment of the import. Freeze the old store (maintenance mode) before the final run, so no order is placed in the old shop after it.
- **Running it again:** the import is repeatable (it updates the same records by their old ids), so a dry run on a copy of production first is safe.
- **Afterwards:** remove the `IMPORT_WOO_*` values, point the domain at the new server, and keep the old WordPress site offline but archived.

## 7. Updating

```bash
git pull && npm ci && npm run build:all
cd backend && composer install --no-dev --optimize-autoloader
php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan event:cache
php artisan dmd:preflight
sudo systemctl reload php8.4-fpm
```

Migrations are additive and run inside the deploy; take a backup first (`sudo systemctl start dmd-world-backup`).

## 8. Checks after deploying

- `https://shop.example.com/api/v1/health` answers `{"status":"ok",…}` (it reports 503 if MySQL is down).
- The storefront loads products, a test buyer can sign in, and `/admin/` shows the sign-in page.
- `curl -I https://shop.example.com/api/v1/catalog` shows `Strict-Transport-Security` and `X-Content-Type-Options: nosniff`; session cookies are `Secure; HttpOnly; SameSite=Lax`.
- `curl -I https://shop.example.com/` shows the `Content-Security-Policy` from the Caddyfile and `Cache-Control: no-cache`. The browser console on the storefront and the admin shows no CSP errors.
- `https://shop.example.com/robots.txt` names the sitemap, and `https://shop.example.com/sitemap.xml` lists the shop's pages.
- `backend/.env`, `backend/storage/logs` and `/.git` are not reachable over HTTP (Caddy only serves `dist/`, `admin/dist/`, `storage/app/public` and `backend/public/index.php`).
