# DMD World: migration to React + Laravel + MySQL

**Target:** React + Vite (unchanged UI) → Laravel 13 API → MySQL. MySQL is the single source of truth for business data.

**Rule for the whole migration:** the existing app keeps working until Laravel has a tested replacement. The old implementation is removed only after that.

| Phase | Scope | Status |
|---|---|---|
| 0 | Repository audit and migration plan (this document) | Done |
| 1 | Laravel app, MySQL connection, environment, dev proxy | Done |
| 2 | Authentication: buyers, owner, authorization | Done |
| 3 | Categories and brands | Done |
| 4–12 | See §7 | In progress, phase by phase. The details of each phase are in [backend-phase-log.md](backend-phase-log.md) |

---

## 1. Current architecture (audit, 6 Oct 2026)

**Frontend (keeps its design; only its data access changes)**
- **Storefront** (`src/`): React 19 and Vite 8, a custom History router and lazy routes. Pages: home, shop, product-category, product, brands, categories, cart, checkout, order, account, wishlist, compare, contact, reset.
- **Owner admin** (`admin/`): React with a hash router, built separately and served at `/admin`. 14 screens: dashboard, products, categories, brands, inventory, orders, customers, messages, reviews, offers, homepage, notifications, trash, settings.
- **Shared:** `shared/passwordPolicy.js` holds the password rules, used by both UIs and by the Node server.

**Node server (legacy, `server/`, no dependencies)**
- **Buyer API** (`buyer.mjs`): 31 routes under `/api`: session, register, login, logout, password forgot/reset, `/me`, wishlist, orders, the catalog, product details, cart quote, checkout options, placing and cancelling orders, ratings, reviews, messages and stock alerts.
- **Owner API** (`index.mjs`): 63 routes under `/admin/api`: dashboard, products (with trash, restore, bulk), media, categories, brands, inventory, campaigns, coupons, orders, customers, messages, reviews, homepage, notifications, trash, badges, activity, search and settings.
- **Production extras:** it can also serve the built storefront, plus `robots.txt`, `sitemap.xml` and `/healthz`.
- **Where data lives:**
  - **WooCommerce REST v3** (`lib/woo.mjs`) is the system of record for products, categories, stock, customers, orders, order notes, reviews, coupons and store settings.
  - **In-memory mirrors** of products and orders (`lib/indexes.mjs`).
  - **JSON files** in `server/data/`:
    - `state-<env>.json`: which categories are brands, sale campaigns, message read and preview state, notification state, the daily target, the activity log and revoked owner sessions.
    - `buyers-<env>.json`: buyer sessions, reset tokens, read state and stock alerts.
- **Local WooCommerce emulator** (`server/dev/woo-emulator.mjs`, port 8899) and its data `server/dev/emulator-data.json`:
  - **Catalog:** 112 categories and 187 products, copied from the snapshot.
  - **Test data:** 71 customers, 387 orders and 48 reviews.
  - **Coupons:** 2.
- **WordPress plugin** (`wordpress/dmd-buyer-auth`): checks buyer passwords and sends reset and back-in-stock emails.

**Authentication today**
- **Owner:** a single password, stored as an scrypt hash in `OWNER_PASSWORD_HASH` (`server/.env`).
  - **Session:** an HMAC-signed cookie `dmd_admin` (`Path=/admin`), plus a device-trust cookie.
  - **Local login:** `server/dev/LOCAL-TEST-LOGIN.txt` (gitignored, emulator only).
  - **Unused setting:** `OWNER_EMAIL` exists in `server/.env` but no code reads it.
- **Buyers:** passwords are WordPress passwords, checked through the plugin. The session is a random-token cookie `dmd_buyer` (`Path=/api`), and only its SHA-256 is stored, in `buyers-*.json`.

**Tests**
- **Node:** `server/test`, 53 tests (15 unit, 34 API, 4 production). They start their own emulator and server.
- **Checks:** ESLint, the storefront build and the admin build.

**Environment**
- **Server secrets:** `server/.env` holds the WooCommerce keys, the owner hash, the session secret, the plugin secret and URLs.
- **Browser:** gets no secrets. `VITE_STORE_API` is only a path.

## 2. Duplicated and mock business data

| Data | Copies today | In the target |
|---|---|---|
| **Products** | `src/data/dmdCatalog.js` (187-product snapshot of the live store, bundled into the app as a fallback) · WooCommerce · `emulator-data.json` · server memory mirror · browser cache `dmd:catalog:v1` | `products` table. The snapshot is deleted once the Laravel catalog is live. A browser cache may stay, as a cache only. |
| **Categories** | `dmdCatalog.js` CATS · the curated tree in `src/data/dmdMenu.js` (names, ids, children, images, hard-coded) · WooCommerce · emulator · the old template taxonomy in `src/data/meta.js` (CATEGORIES, PLATFORM_TREE) · `src/data/nav.js` (FOOTER_COLS, unused MEGA_* lists) · hard-coded slugs and tiles in `src/components/landing/data.js` | `categories` table (tree, position, visibility, image). The UI keeps only presentation config (icons and accent colours by slug). |
| **Brands** | `BRAND_GROUPS` in `dmdMenu.js` · `brandCategoryIds` in `state-*.json` · `meta.js` BRANDS · FOOTER_COLS · landing BRANDS and PC_BRANDS. Flagging a brand in the admin changes nothing on the storefront. | `brands` table, with `products.brand_id`. |
| **Stock** | WooCommerce · emulator · snapshot `inStock` · catalog cache | One `stock_quantity` per product, changed only through the inventory service. |
| **Orders** | WooCommerce or emulator · server mirror · message previews copied into `state-*.json` · guest order keys in localStorage | `orders` and `order_items` (with price and name snapshots). |
| **Customers** | WooCommerce customers · WordPress users (passwords) · `buyers-*.json` sessions · wishlist in WooCommerce customer meta · guest wishlist in localStorage | `users`, `addresses`, `wishlist_items`. |
| **Offers** | Campaigns in `state-*.json` that **write** sale prices into WooCommerce and keep a "previous" copy to undo it · WooCommerce coupons | `offers` and `coupons`, priced by one pricing service. Product prices are never overwritten. |
| **Messages** | WooCommerce order notes prefixed `[Buyer message]` · read state and previews in both JSON files | `conversations` and `messages`. |
| **Reviews** | WooCommerce reviews (title stored as `<strong>` inside the body) · ratings cache | `reviews` (title, body and status as real columns). |
| **Homepage** | The admin Homepage screen edits WooCommerce "featured" flags and category order, which **the React storefront never reads**. Hero and banners are Elementor (WordPress). The React landing copy is hard-coded. | `products.is_featured`, `categories.position`, `banners`, `settings`. |
| **Settings** | WooCommerce settings · `dailyTarget` in `state-*.json` · the CONTACT constant in `dmdMenu.js` · phone and email in Home's JSON-LD | `settings` table. |
| **Business rules** | Coupon rules written twice (`couponDiscount` in `buyer.mjs` and `applyCoupons` in the emulator) · order-status labels on both server and client | One Laravel service per rule. Labels stay as UI copy. |

**Browser storage** (data kept on the visitor's device)
- **Device conveniences, kept:** the cart, compare list and guest wishlist (`loadout:v1`), recently viewed (`dmd:recent`), the platform picker choice, the checkout draft (sessionStorage) and the error-reload flag.
- **Catalog cache:** `dmd:catalog:v1` stays only as a cache of API data.
- **Guest order keys:** `dmd:guest-orders` will become guest order tokens issued by Laravel.
- **Nothing secret or authoritative is stored in the browser.**

## 3. Migration risks

1. **IDs are baked in.** Product and category ids appear in URLs (`/product/34198`), in carts and wishlists saved in browsers, in recently viewed, in the curated menu and in search-engine links. **Mitigation:** the import keeps the WooCommerce ids as primary keys.
2. **Storefront URLs follow the curated tree, not the WooCommerce hierarchy.** For example `/product-category/playstation/ps5/games/used`. **Mitigation:** categories get `slug` and `path` columns seeded from that tree, so every current URL resolves.
3. **Brands are categories today.** Razer, HyperX and others are top-level categories with their own sub-categories ("Razer Mouse"). **Mitigation:** they become `brands`, and their sub-categories become categories scoped to that brand (`categories.brand_id`), so `/product-category/razer/mouse` keeps working without a second copy of the brand.
4. **Products, stock, prices, accounts, orders and messages are coupled in the UI.** For example, checkout prices from the catalog, the account tab lists orders and messages hang off orders. Switching one screen to Laravel while another still uses WooCommerce would show two different truths. **Mitigation:** one build-time switch (`VITE_BACKEND`, §5) moves the whole app at once. Until the cutover, Laravel features are proven by API tests and by running the app with the switch on.
5. **Buyer passwords live in WordPress.** Laravel can't read them through REST. **Decision at cutover:** read the WordPress user table once and accept WordPress hashes on first sign-in (then re-hash), or ask buyers to reset.
6. **The live store keeps trading in WordPress until go-live.** A final import (catalog, stock, customers, orders, reviews) is needed at cutover, and the importer must be repeatable (upserts).
7. **Images are hosted on dmdworld.store/wp-content/uploads.** They must be copied into Laravel storage or a CDN before WordPress is retired.
8. **WooCommerce features must be rebuilt in Laravel:** order and reset emails, store settings, payment methods (cash on delivery and bank transfer), and the cancel window.
9. **Sanctum needs the page's referrer.** It treats a request as the SPA's only when it carries `Origin` or `Referer`. The pages must keep `Referrer-Policy: strict-origin-when-cross-origin`. The storefront already does; the Node page headers use `no-referrer`, which must not be copied to the new web server config.
10. **Running two backends side by side.** Cookie names differ (`dmd_buyer` and `dmd_admin` for Node; `dmd_session` and `XSRF-TOKEN` for Laravel) and the paths don't overlap (`/api` and `/admin/api` for Node; `/api/v1` for Laravel), so they can't interfere.
11. **Windows development:** `php artisan serve` is single-threaded and doesn't pass extra environment variables to its worker. Both are fine for development; production uses php-fpm or FrankenPHP.

## 4. What is reused

- **Unchanged:** the React UI, components, styles, routes and the local-only conveniences.
- **Server logic to port into Laravel services:**
  - **Rules:** order validation (quantity limits, stock checks, idempotency) and coupon rules.
  - **Security limits:** rate-limit values and the cancel-only-while-pending rule.
- **Single sources the UI keeps using:**
  - **Password rules:** `shared/passwordPolicy.js` stays for the live checklist. Laravel enforces the same rules.
  - **Status labels:** `storeApi.js` ORDER_STATUS.
- **Tests:** the Node tests stay until the Node code they cover is deleted. Their scenarios become Laravel feature tests (IDOR, login brakes, idempotency, cross-site refusal).

## 5. Target architecture

```
Browser ─ storefront (/) and admin (/admin): React + Vite builds, served as static files
   │  same origin
   ├─ /api/v1/*        → Laravel 13 (php-fpm or FrankenPHP)
   │                       ├─ MySQL: every business record
   │                       ├─ storage/app/public: uploaded images
   │                       └─ queue worker and scheduler: emails, stock alerts
   └─ /api/v1/admin/*  → the same Laravel app, owner guard only
```

**Development**
- **Proxy:** Vite on 5173 forwards `/api/v1` to `php artisan serve` on 8000.
- **Legacy routes:** `/api` and `/admin/api` still go to Node until Phase 11.

**Production**
- **Front:** Caddy or nginx serves `dist/` and `admin/dist/` and forwards `/api/v1` to Laravel.
- **Node:** removed.

**Laravel layout** (`backend/`)
- `app/Models`: Eloquent models with explicit `$fillable` (no `$guarded = []`).
- `app/Http/Controllers/Api/V1/...` for storefront and account controllers, and `.../Admin/...` for the owner. Controllers stay thin.
- `app/Http/Requests`: Form Requests hold all validation.
- `app/Http/Resources`: API Resources shape every response, and hidden fields never leak.
- `app/Policies`: ownership checks (an address, order, review or conversation belongs to the signed-in buyer).
- `app/Services`: only where logic is shared: Pricing (sale price, offers, coupons), Checkout (one transaction with row locks), Inventory (stock movements).
- `app/Enums`: order status, product status, review status.
- `database/migrations`, `database/seeders` and `database/factories`, plus import commands.

**Authentication**
- **Mechanism:** Laravel Sanctum in SPA mode. That means an encrypted session cookie (HttpOnly, SameSite=Lax, Secure in production) stored in MySQL, with CSRF protected by the `XSRF-TOKEN` cookie and `X-XSRF-TOKEN` header. Bearer tokens are switched off, so no token is ever handed to JavaScript.
- **Two guards, two tables:**
  - **Buyers:** the `web` guard on `users`, used by `auth:sanctum`.
  - **Owner:** the `admin` guard on `admins`, used by `auth:admin` on `/api/v1/admin/*`.
  - **Separation:** a buyer session can never satisfy the admin guard. Signing in as the owner doesn't sign anyone in as a buyer, and the reverse holds too.
  - **No role switch to abuse:** there is no `role` column that mass assignment could flip.
- **Owner account:** created with an artisan command that asks for email and password. No seeded production credentials, and no hard-coded passwords anywhere.
- **Passwords:**
  - **Rules:** `Password::min(8)->mixedCase()->numbers()->symbols()`, enforced server-side. These are the same rules as `shared/passwordPolicy.js`.
  - **Hashing:** Argon2id.
  - **On login:** the session is regenerated, and login is throttled per email and per address.
  - **Reset:** Laravel's password broker stores hashed, expiring tokens and sends the link to `FRONTEND_URL`.

**Frontend connection**
- **New API layer:** each feature gets a small client module that talks to `/api/v1`, with CSRF handling.
- **The switch:** `VITE_BACKEND=node|laravel` decides which backend the whole app uses, so a running app never mixes the two for the same data.
- **Default:** stays `node` until Phase 11. Then the Node clients are deleted.

## 6. Proposed MySQL schema

InnoDB, utf8mb4. Money is `DECIMAL(10,2)` in USD. All tables have timestamps.

| Table | Key columns | Constraints and notes |
|---|---|---|
| `users` (buyers) | first_name, last_name, email, phone, password, email_verified_at, marketing_opt_in, last_login_at, disabled_at, remember_token | `email` unique, stored lower-cased |
| `admins` (owner) | name, email, password, remember_token, last_login_at | `email` unique; one row, created by command |
| `password_reset_tokens`, `sessions`, `cache`, `jobs` | Laravel defaults | sessions hold `user_id` for buyers |
| `addresses` | user_id, label, first_name, last_name, phone, country (char 2, default LB), city, area, street, building, floor, notes, is_default | FK users cascade; one default per buyer (unique generated column `default_for = IF(is_default, user_id, NULL)`) |
| `brands` | name, slug, logo_path, description, is_visible, position, deleted_at | `slug` unique; soft delete = archive |
| `categories` | parent_id, brand_id, name, slug, path, description, image_path, icon, accent_color, is_visible, is_featured, position, deleted_at | FK parent restrict; FK brands null; `path` unique (`playstation/ps5/games`), so storefront URLs resolve directly |
| `products` | brand_id, name, slug, sku, short_description, description, regular_price, sale_price, sale_starts_at, sale_ends_at, status (draft, published, archived), is_featured, track_stock, stock_quantity, low_stock_threshold, stock_status, weight_kg, length_cm, width_cm, height_cm, published_at, deleted_at | `slug` unique, `sku` unique (nullable); CHECK sale_price < regular_price, stock_quantity ≥ 0; indexes (status, is_featured), (brand_id) |
| `category_product` | product_id, category_id, is_primary | composite PK; the "New Offers" row is just a category |
| `product_images` | product_id, path or url, alt, position | FK cascade |
| `product_specifications` | product_id, name, value, position | FK cascade (no free-form JSON) |
| `inventory_movements` | product_id, change, reason (order, cancel, adjustment, restock, import), order_id, admin_id, note | append-only history of the one stock value |
| `orders` | number, user_id, status (pending, processing, on_hold, completed, cancelled, refunded, failed), email, phone, first_name, last_name, delivery_method, payment_method, payment_status, ship_country, ship_city, ship_area, ship_street, ship_building, ship_floor, ship_notes, currency, subtotal, discount_total, shipping_total, total, coupon_id, coupon_code, customer_note, guest_token_hash, idempotency_key, placed_at, cancelled_at, cancel_reason | `number` unique, `idempotency_key` unique, `guest_token_hash` unique; FK users null on delete; the address is copied in (a snapshot, not a link) |
| `order_items` | order_id, product_id, product_name, sku, image_url, unit_price, regular_price, quantity, line_subtotal, line_discount, line_total | FK orders cascade; FK products null on delete, so history survives product changes |
| `order_status_history` | order_id, from_status, to_status, actor (buyer, admin, system), note | the order timeline and the owner's audit trail |
| `wishlist_items` | user_id, product_id | composite PK (no duplicates); FKs cascade |
| `stock_alerts` | user_id, product_id, notified_at | unique (user_id, product_id) |
| `reviews` | product_id, user_id, rating, title, body, status (pending, approved, rejected, spam), is_verified_purchase, moderated_by, moderated_at | unique (user_id, product_id); CHECK rating 1–5; text stored as plain text |
| `conversations` | user_id, order_id, subject, status, last_message_at, buyer_read_at, admin_read_at | two parties (buyer and owner), so no participants table is needed |
| `messages` | conversation_id, sender (buyer, admin, system), user_id, admin_id, body | FK cascade; body is plain text |
| `offers` | name, type (percent, fixed), value, starts_at, ends_at, is_active, deleted_at | plus pivots `offer_product` and `offer_category`. Applied when prices are calculated; never written into product prices. |
| `coupons` | code, type (percent, fixed_cart, fixed_product), amount, min_subtotal, max_subtotal, usage_limit, usage_limit_per_user, starts_at, expires_at, exclude_sale_items, is_active, deleted_at | `code` unique (upper-cased); plus pivots `coupon_product` and `coupon_category` |
| `coupon_redemptions` | coupon_id, order_id, user_id, email | usage limits are checked under a row lock inside the order transaction |
| `banners` | placement (announcement, hero, promo), title, body, cta_label, cta_url, image_path, starts_at, ends_at, is_active, position | the homepage copy the owner edits; no general CMS |
| `settings` | key (PK), value (JSON) | store name, contact, currency, default low-stock threshold, reviews on and requiring purchase, coupons on, payment and delivery options, daily target |
| `activity_log` | admin_id, action, subject_type, subject_id, description | the dashboard feed and audit trail |

**Not created, on purpose**
- `personal_access_tokens`: there is no token auth.
- `wishlists`: one list per buyer, so `wishlist_items` is enough.
- `conversation_participants`: conversations always have exactly two sides.
- `product_variants`: every DMD product today is a simple product. Add the table if variable products are ever sold.
- Analytics tables: analytics are queries over orders.

## 7. Migration plan

Each phase follows the same steps: schema, then model, then validation, then endpoint, then **tests**, then the React client (behind `VITE_BACKEND`). It ends with every test green and the storefront build passing. Nothing old is deleted before Phase 11.

| Phase | Work | Done when |
|---|---|---|
| 1 ✔ | Laravel 13 in `backend/`, MySQL, `/api/v1`, Sanctum SPA config, error format, security headers, health check, `db:provision`, Vite proxy | 19 tests green on MySQL; `/api/v1/health` reached through Vite |
| 2 ✔ | `users` and `admins`, both guards, register, login, logout, me, change password, forgot and reset (mail to log), owner command, throttling | auth and authorization tests (duplicate email, weak password, wrong login, logged-out protection, buyer cannot reach admin, guards separate) |
| 3 ✔ | `brands` and `categories` (tree, path, visibility, archive), public and admin CRUD, an import from the curated menu and WooCommerce source | CRUD and validation tests; storefront URL paths resolve |
| 4 | `products`, images, specifications, inventory and movements; admin CRUD with archive and restore; a public catalog endpoint; `dmd:import-woocommerce` (read-only, keeps ids) | an admin change shows up in the public API; one stock value |
| 5 | React catalog client: catalog, product page, category and brand pages, menus from the API, search; admin catalog screens | `VITE_BACKEND=laravel` browses the imported catalog; both builds pass |
| 6 | Profile, `addresses`, `wishlist_items` (and guest-wishlist merge) | ownership tests (buyer A ≠ buyer B) |
| 7 | `orders`, `order_items`, status history, checkout (prices and stock locked in one transaction, idempotency, guest token), cancel, admin orders | totals recomputed server-side; overselling is impossible; history survives product edits |
| 8 | `reviews` (one per buyer per product, moderation), `conversations` and `messages`, `stock_alerts` | participant and ownership tests |
| 9 | `offers`, `coupons`, redemptions, `banners`, `settings`, featured products and categories on the storefront home | one pricing service used by catalog, cart and checkout |
| 10 | Admin analytics (revenue, orders by status, top products, categories and brands, low stock, customers) as queries | zeros and empty states when there's no data, never invented numbers |
| 11 | Final import from the live store; switch the default to `laravel`; delete the Node server, emulator, WordPress plugin (if unused), `dmdCatalog.js`, the static menu ids, the JSON stores and the Node tests | the app runs on Laravel only |
| 12 | Security and regression pass, production config (Caddy and php-fpm, queue and scheduler, backups, `APP_DEBUG=false`, secure cookies) | full test suite and manual flows pass |

## 8. Phase 1: what exists and how to run it

- **`backend/`**: Laravel 13.34 on PHP 8.4. It's API-only: no Blade pages and no frontend build.
  - **Routes:** `/api/v1/health` (MySQL check), `/api/v1/sanctum/csrf-cookie` and `/up`.
  - **Errors:** every error is `{"error": {"code", "message", "fields"?}}`, with no internal messages.
  - **Headers:** `nosniff`, `DENY` and `no-store` on every response.
  - **Rate limit:** 240 requests per minute per account or address.
  - **Development:** strict models, and destructive DB commands are blocked in production.
- **MySQL:** the app uses `dmd_world`; the tests use `dmd_world_testing`, which is wiped each run. The suite refuses to start against any other database.
- **One-time setup on your machine** (MySQL 26.7 service on port 3306):

  ```bash
  cd backend
  php artisan db:provision
  php artisan migrate
  ```

  `db:provision` asks for your MySQL root password, which is not stored. It then creates both databases and a dedicated `dmd_world` account; that account's password is already generated in `backend/.env`.
- **Run:**
  - **API:** `npm run api:serve` starts Laravel on 127.0.0.1:8000, reachable through Vite at `http://localhost:5173/api/v1/...`.
  - **Tests:** `npm run test:api`.
  - **Everything:** `npm run check` now also runs the Laravel tests.
