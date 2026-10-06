# DMD World

The DMD World storefront (React + Vite) and the owner's back office (`admin/`).

**Architecture: moving to React + Laravel + MySQL.** The Laravel API in `backend/` is the target backend, and MySQL becomes the single source of truth. It replaces the Node server and WooCommerce feature by feature, without breaking the running app. The plan, the audit and the schema are in [docs/laravel-migration.md](docs/laravel-migration.md). Until the switch, the app runs on the legacy Node server described below and in [admin/README.md](admin/README.md).

```
src/        storefront: pages, layout, catalog data, store state (cart, account, orders)
admin/      owner back office (served at /admin)
backend/    Laravel API (/api/v1) and MySQL schema: the target backend (see backend/README.md)
server/     legacy Node API (/api for buyers, /admin/api for the owner), WooCommerce client, tests
shared/     code used by all three (password rules)
wordpress/  DMD Buyer Auth plugin for the WordPress site (buyer sign-in, reset and stock-alert emails)
deploy/     example production configuration (Caddy, systemd)
```

## Run it locally

Each command in its own terminal:

```bash
npm --prefix server run emulator
```

```bash
npm --prefix server start
```

```bash
npm run dev
```

- **Storefront:** http://localhost:5173 (any port works: Vite forwards `/api` and `/admin/api` to the server on :8787).
- **Admin:** http://localhost:5173/admin/. The local password is in `server/dev/LOCAL-TEST-LOGIN.txt`.
- **Emails** from the emulator (password resets, back-in-stock) are written to `server/dev/outbox/`.

## Check everything

```bash
npm run check
```

Runs the linter, both production builds, the Node server's unit and end-to-end tests (against a private emulator with its own temporary data) and the Laravel tests (against the `dmd_world_testing` MySQL database, see [backend/README.md](backend/README.md)). Separately: `npm run lint`, `npm run build:all`, `npm test`, `npm run test:api`.

## Catalog

The storefront loads the live WooCommerce catalog from `/api/catalog`: prices, sales, stock and new products, refreshed every few minutes. `src/data/dmdCatalog.js` is a bundled snapshot of dmdworld.store (captured 2026-10-02) used only until the live catalog arrives, or when the server can't be reached. Product photos are hotlinked from dmdworld.store.

## Payments

Orders are real WooCommerce orders paid on delivery or by bank transfer, confirmed by DMD. No card payments are taken online; adding them needs a payment provider and is a business decision.

## Brands

Brand names are shown as typographic wordmarks. Use licensed logos only with permission from each brand.
