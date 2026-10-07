# DMD World

The DMD World storefront and the owner's back office, on one stack:

```
React + Vite (storefront at /, admin at /admin/)  →  Laravel API (/api/v1)  →  MySQL (the single source of truth)
```

```
src/        storefront: pages, layout, catalog, store state (cart, account, checkout, orders)
admin/      the owner's back office, served at /admin/ (see admin/README.md)
backend/    Laravel API and MySQL schema: everything the store knows lives here (see backend/README.md)
shared/     code used by the storefront, the admin and mirrored by the API (password rules)
deploy/     production configuration (Caddy, systemd timer for the scheduler)
docs/       the migration plan and log (laravel-migration.md, backend-phase-log.md) and deployment.md
```

## Run it locally

Requirements: Node 20+, PHP 8.4 with Composer (Laravel Herd provides both PHP and Composer) and MySQL 8+. First-time setup of the API is in [backend/README.md](backend/README.md). Then, each in its own terminal:

```bash
npm run api:serve
```

```bash
npm run dev
```

- **Storefront:** http://127.0.0.1:5173 (the one development address; see below)
- **Admin:** http://127.0.0.1:5173/admin (deep links such as `/admin/orders` or `/admin/products/123` open that screen). Create the owner account once with `php artisan dmd:owner` (inside `backend/`).
- **Emails** (password resets, order confirmations, replies, back-in-stock) are written to `backend/storage/logs/laravel.log` until SMTP is configured.

The Vite dev server forwards `/api/v1` and `/storage` to Laravel on :8000, so the browser only ever talks to its own origin, exactly as in production.

**One development address: http://127.0.0.1:5173.** Laravel gives cookie sessions only to this origin (`SANCTUM_STATEFUL_DOMAINS` in `backend/.env`), so:
- **Port taken:** if 5173 is busy, `npm run dev` stops with "Port 5173 is already in use" instead of moving to 5174. Stop the old dev server and run it again. (On a fallback port, sign-in and sign-up fail with "Please use the DMD World website to sign in.")
- **`localhost:5173`:** redirected to `127.0.0.1:5173`. To the browser and to Sanctum it is a different site, with its own cookies.

## Check everything

```bash
npm run check
```

Runs the linter, both production builds (`dist/` and `admin/dist/`) and the Laravel test suite (against the `dmd_world_testing` MySQL database). Separately: `npm run lint`, `npm run build:all`, `npm test`.

## Data

MySQL holds everything: catalog, stock, customers, orders, reviews, messages, offers, coupons, settings and the home page. The browser keeps only device conveniences (cart, compare list, a guest's wishlist, a cached copy of the catalog and a guest's private order links). The data came from the old WooCommerce store with `php artisan dmd:import`; [docs/deployment.md](docs/deployment.md) describes the final import at go-live.

## Payments

Orders are paid on delivery or by bank transfer and confirmed by DMD. No card payments are taken online; adding them needs a payment provider and is a business decision.

## Brands

Brand names are shown as typographic wordmarks. Use licensed logos only with permission from each brand.
