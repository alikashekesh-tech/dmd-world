# DMD World backend migration: phase log

A running record of each phase of the move from Node/WooCommerce to Laravel and MySQL. The plan and the schema are in [laravel-migration.md](laravel-migration.md).

How to read test numbers: "Laravel" means `php artisan test` in `backend/`, run against the real MySQL test database `dmd_world_testing`. "Node" means the legacy suite, `npm test`.

---

## Phase 0: audit and plan (6 Oct 2026)

- **Implemented:** the repository audit, the list of duplicated data, the risks, the target architecture and schema, and the phase plan. All of it is in `docs/laravel-migration.md`.
- **Tests:** none (documentation only).

## Phase 1: Laravel and MySQL foundation (6 Oct 2026)

- **Implemented:**
  - **App:** Laravel 13.34 in `backend/` (API only), with routes under `/api/v1`.
  - **Sign-in plumbing:** Sanctum in SPA cookie mode. Bearer tokens are switched off.
  - **Errors and headers:** one JSON error format (`ApiExceptionRenderer`), plus security headers and `Cache-Control: no-store`.
  - **Health and limits:** a health check (`/api/v1/health`, which skips the session and rate limiter so an outage shows as a clean 503) and a 240-requests-per-minute API rate limit.
  - **Model safety:** strict models outside production, and destructive database commands blocked in production.
  - **Database setup:** `php artisan db:provision`.
  - **Dev wiring:** the Vite proxy rule for `/api/v1`, and the npm scripts `api:serve`, `test:api` and an extended `check`.
- **Migrations:** Laravel's defaults (users, sessions, password_reset_tokens, cache, jobs). The personal access tokens table was removed because nothing uses tokens.
- **Endpoints:** `GET /api/v1/health`, `GET /api/v1/sanctum/csrf-cookie`.
- **Tests:** 19 Laravel tests (the error format, headers, CORS, CSRF and session cookies, rate limits, health, and the provisioning command's safety checks). A mutation check confirmed the error tests really guard the error format.
- **Results:** Laravel 19 of 19. Node 53 of 53. Lint and both builds pass.

## Phase 2: buyer and owner authentication (6 Oct 2026)

**Implemented**
- **Buyers** (`users` table, `web` guard used by `auth:sanctum`):
  - register, login, logout and me
  - change password
  - forgot password and reset password, plus a check that a reset link is still valid
  - remember-me for 30 days
- **Owner** (`admins` table, `admin` guard on `/api/v1/admin`): login, logout, me and change password. There is no email reset for the owner on purpose.
- **Owner command:** `php artisan dmd:owner` creates the owner, `--reset` changes their email, name or password, and `--local-test` sets up a development owner.
  - **Passwords:** typed at a hidden prompt and never printed.
  - **One owner:** a second owner is refused, both by the command and by the database.
  - **`--local-test`:** only works with `APP_ENV=local`. It writes a generated password to `storage/app/private/local-owner-login.txt`, which git ignores.
- **Password policy:** `App\Rules\StrongPassword` uses the same five rules and wording as `shared/passwordPolicy.js`, enforced on the server. A space doesn't count as a special character. Maximum 128 characters.
- **Hashing:** Argon2id (`HASH_DRIVER=argon2id`). The tests use cheaper settings, but the same algorithm.
- **Emails:** trimmed and lower-cased before they are stored or compared, with a unique index. A duplicate email gets `409 EMAIL_ALREADY_EXISTS`, even when two sign-ups race.
- **Sessions:**
  - **Fixation:** the session id is regenerated at every sign-in.
  - **Sign-out:** it changes the session id and the CSRF token and cycles the remember token. A copied cookie stops working.
  - **Shared browser:** signing out as a buyer leaves an owner signed in to the admin in the same browser.
  - **Password changes:** changing or resetting a password signs out every other device. Sanctum and Laravel compare the password hash kept in the session, and remember tokens are replaced.
- **Throttling:**
  - **Login:** 5 wrong passwords per account and address in 15 minutes, and 30 per address for buyers or 10 for the owner. After that the API answers `429 TOO_MANY_ATTEMPTS` with `Retry-After`.
  - **Current password:** 5 wrong current passwords per account, even with a valid session.
  - **Sign-up:** 8 per hour per address.
  - **Reset emails:** 10 per hour per address and 3 per hour per email.
  - **Reset attempts:** 20 per 15 minutes per address.
- **Session-only sign-in:** sign-in routes require a cookie session (`SESSION_REQUIRED` otherwise), and API requests always get JSON answers (`ForceJsonResponse`), so a signed-out request gets a 401 rather than a redirect or a 500.
- **Forgot-password:** answers the same whether or not the account exists. The link goes to `FRONTEND_URL/account/reset?token=…&email=…`. With `MAIL_MAILER=log`, the email is written to `storage/logs/laravel.log` and not sent; that is the honest state until SMTP is configured.
- **Imported customers:** they get a null password (they can't sign in) until they choose one through "Forgot password". This is ready for the customer import.

**Migrations**
- `0001_01_01_000000_create_users_table`: changed while there was still no data. It now has first_name, last_name, email (unique), phone, email_verified_at, nullable password, marketing_opt_in, last_login_at and remember_token.
- `2026_10_06_000100_create_admins_table`: name, email, password, remember_token, last_login_at, and a `singleton` column that is unique and has a CHECK constraint, so MySQL accepts only one owner.

**Endpoints**

| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/auth/register | first_name, last_name, email, phone?, password, password_confirmation, marketing_opt_in? → 201 |
| POST | /api/v1/auth/login | email, password, remember (default true) |
| POST | /api/v1/auth/logout | 204 |
| GET | /api/v1/auth/me | signed-in buyer |
| PUT | /api/v1/auth/password | current_password, password, password_confirmation |
| POST | /api/v1/auth/forgot-password | email → always 200 |
| POST | /api/v1/auth/reset-password/check | email, token → `{valid}` |
| POST | /api/v1/auth/reset-password | email, token, password, password_confirmation → signs in |
| POST | /api/v1/admin/auth/login | email, password |
| POST | /api/v1/admin/auth/logout | 204 |
| GET | /api/v1/admin/auth/me | owner only |
| PUT | /api/v1/admin/auth/password | current_password, password, password_confirmation |

**Tests added:** 44
- **Registration:** normalisation, duplicate emails in any case, six kinds of weak password, mismatched confirmation, field formats and markup in names, the sign-up rate limit.
- **Sessions:**
  - **Credentials:** sign-in, case-insensitive email, the same answer for a wrong password and an unknown email, and that an imported account without a password can't sign in.
  - **Session lifecycle:** me needs a session; the id changes at sign-in; sign-out kills a copied cookie; remember-me on and off.
  - **Locks and session rules:** the lockout applies on the attacker's connection while the real buyer still gets in, and requests without a session are refused.
- **Passwords:** change needs the current password and a strong, different new one; other devices are signed out; wrong current passwords are throttled; forgot-password gives the same answer and only emails real accounts; reset signs in and works once; an imported customer can choose a first password; reset emails are throttled per email.
- **Owner:** sign-in, me and sign-out; wrong passwords throttled; buyer sessions refused; buyer credentials don't open the admin even with the same email; the owner is not a buyer; owner and buyer in one browser stay independent; owner password change signs out other devices; MySQL refuses a second owner.
- **Owner command:** create without printing the password, only one owner, reset, weak or mismatched passwords refused, `--local-test` refused outside local.

The tests use a browser-like client (`tests/SpaClient.php`). Each "browser" has its own cookies and address, and every request starts with fresh session, auth and cookie state, with sessions stored in MySQL as in production.

**Verification beyond the tests:** against a real server, through the Vite proxy:
- **CSRF:** a POST without `X-XSRF-TOKEN` got 419 `SESSION_EXPIRED`; with the token, sign-up returned 201, me 200, logout 204, and me afterwards 401.
- **Cookies:** the session cookie is HttpOnly and SameSite=Lax.
- **Mutation:** pointing the admin routes at buyer sessions made 4 owner tests fail.

**Results:** Laravel 63 of 63 (406 assertions). Node 53 of 53 (no Node changes). The builds aren't affected, since no frontend code changed.

**Decisions**
- **Two accounts:** separate tables and guards, rather than a role column on users.
- **Owner reset:** only through the server command, so there's no public reset form for the most powerful account.
- **Argon2id over bcrypt:** bcrypt silently cuts passwords at 72 bytes, and Argon2id resists brute force better.

**Bugs found and fixed**
- **Rate-limiter 429s:** custom 429 responses were rendered as 500, because the error renderer intercepted `HttpResponseException`. It now passes these responses through.
- **Guest redirects:** signed-out non-JSON requests would have crashed while redirecting to a login route that doesn't exist. Fixed with `ForceJsonResponse` and `redirectGuestsTo(null)`.

**Blockers:** none. Outgoing email needs SMTP settings (`MAIL_*`) before going live.

**Next:** Phase 3, categories and brands.

## Phase 3: categories and brands (6 Oct 2026)

**Implemented**
- **Brands are first-class records** (`brands`): name, slug, description, logo_url, is_active, position, and archive by soft delete. Each product will point at one brand (Phase 4). Brands are no longer flagged categories.
- **Categories** (`categories`): a tree (`parent_id`) with name, slug, description, image_url, icon, accent_color, is_visible and position, plus archive by soft delete. A top-level category can belong to a brand, which makes it one of that brand's **product lines** (Razer › Mouse); its sub-categories inherit the brand.
- **`CategoryTree` service:** one in-memory view of the tree that works out storefront URL paths (`playstation/ps5/games/used`, `razer/mouse`), visibility, descendants and lookup by path. A category is on the storefront only when it, every parent above it and its brand are visible and not archived.
- **`CategoryService` and `BrandService`:** every write goes through them, so the rules always hold.
  - **Tree shape:** no category inside itself, and at most 5 levels.
  - **Brand inheritance:** a sub-category belongs to its parent's brand. Changing a product line's brand moves its whole branch.
  - **Slugs:** unique among siblings. MySQL enforces this with a unique index on stored keys, because a plain unique index would let NULL parents repeat. A given slug that's taken gets `422 SLUG_TAKEN`; an automatic slug gets `-2`, `-3`. Top-level categories and brands never share a slug, because both live at `/product-category/<slug>`.
  - **Renaming keeps the URL:** the slug stays unless a new one is sent, so links keep working.
  - **Archiving:** refused while a category has active sub-categories (`409 CATEGORY_HAS_CHILDREN`). Restoring needs the parent and brand to be active. Permanent deletion only works on an archived record that nothing uses.
  - **Reordering:** siblings only.
- **Activity log** (`activity_log`): who did what to which record. Every category and brand change is recorded with the owner's id. It will feed the dashboard and the audit trail.
- **Legacy ids, with no collisions:** imported records keep their WooCommerce ids. Records created in Laravel start at 100000 (categories, brands and also users), so new rows can never take an id the old store used.
- **Import** (`php artisan dmd:import --only=taxonomy`):
  - **How it reads the old store:** read-only, through the WooCommerce REST API (`WooCommerceSource`, GET only).
  - **How it builds the tree:** it follows `database/import/storefront-taxonomy.php`, which was generated from the storefront's menu (`src/data/dmdMenu.js`). That file is migration history, not live data.
  - **Brands:** the 10 brand categories become brands with the same ids, and their sub-categories become product lines.
  - **Storefront tree:** the PS5 and PS4 games, accessories and consoles move under PS5 and PS4, as the storefront shows them.
  - **New groupings:** "Other", "Flash Memory" and "Repair Parts" are created with new ids.
  - **Categories the menu didn't list (16):** they sit under their WooCommerce parent, with tidied names ("BLUETOOTH SPEAKER" becomes "Bluetooth Speaker").
  - **Safety:** each part runs in a transaction and can be repeated, with the same rows updated rather than duplicated. It refuses to run in production without `--force`.

**Migrations**
- `2026_10_06_000200_create_brands_and_categories_tables` (ids start at 100000; generated `parent_key` and `brand_key` columns with a unique sibling-slug index; foreign keys use restrict on delete).
- `2026_10_06_000300_create_activity_log_table`.
- The users table's ids now also start at 100000.

**Endpoints**

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/categories | visible categories, flat, in display order, with `path` |
| GET | /api/v1/categories/{id} | with `ancestors`, `children` and `brand` |
| GET | /api/v1/categories/lookup?path=a/b/c | the category behind a storefront URL |
| GET | /api/v1/brands | active brands |
| GET | /api/v1/brands/{slug} | with `product_lines` |
| GET POST | /api/v1/admin/categories | `?archived=only` or `?archived=with` |
| GET PUT DELETE | /api/v1/admin/categories/{id} | DELETE archives |
| POST | /api/v1/admin/categories/{id}/restore · DELETE …/permanent · POST /api/v1/admin/categories/reorder | |
| GET POST, GET PUT DELETE, restore, permanent, reorder | /api/v1/admin/brands… | same pattern |

**Tests added:** 23
- **Categories:**
  - **One source:** the owner adds a category and the storefront lists it, from the same rows.
  - **Paths:** nested paths resolve.
  - **Validation:** names, slugs, `javascript:` image addresses, markup and unknown parents are rejected.
  - **Slugs:** unique among siblings, with automatic `-2`.
  - **Tree rules:** no cycles; brand product lines with inheritance and branch moves; no category and brand sharing a URL.
  - **Visibility:** hidden categories take everything below them off the storefront; an inactive brand hides its lines.
  - **Lifecycle:** archive, restore and permanent delete; reordering siblings only.
  - **Access:** guests and buyers get 401 on every write.
- **Brands:** the owner adds a brand and the storefront shows it; validation and unique slugs; inactive brands leave the storefront but stay in the admin; archive, restore and permanent delete (refused while in use); reordering; only the owner can change brands.
- **Import:**
  - **Fixture:** the WooCommerce category list, `tests/Fixtures/woocommerce/categories.json`.
  - **What's checked:** legacy ids kept, brands split out, the storefront tree, new groupings above 100000, unlisted categories placed, and all 112 WooCommerce categories accounted for.
  - **Safety:** running it twice changes nothing; the storefront API serves the imported tree; production is refused without `--force`; a failing store leaves nothing half-imported.

**Results**
- **Tests:** Laravel 86 of 86 (628 assertions). Node 53 of 53 (no Node changes).
- **Real import from the local emulator into the dev database, run twice:** 10 brands and 105 categories (102 from WooCommerce plus 3 groupings), the same counts both times.
- **Through the Vite proxy:** `/api/v1/categories` returns 105, with the same top-level order as the current menu (pc-parts, playstation, nintendo-switch, xbox, tablets, laptops, other, new-offers). `/api/v1/brands` returns the 10 brands in menu order. `/brands/razer` lists its 7 product lines, and `lookup?path=other/action-figures` resolves.

**Decisions**
- **Brand subtrees:** brand-scoped categories, rather than a separate brand-and-category pivot. This keeps the existing `/product-category/<brand>/<line>` URLs and the storefront's menu without a second copy of the brand.
- **No stored path column:** paths are computed from the tree, which is small and loaded once per request, so there's nothing to keep in sync.

**Legacy dependencies removed:** none yet. The storefront still reads `dmdMenu.js` and `dmdCatalog.js`; that changes in Phase 5.

**Blockers:** none.

**Next:** Phase 4, products, images and inventory.

## Phase 4: products, images and inventory (6 Oct 2026)

**Implemented**
- **`products`:** one row per product, the single source for its name, prices, stock and status.
  - **Fields:** brand_id, name, slug, sku, short_description and description (plain text), regular_price, sale_price with optional sale_starts_at and sale_ends_at, status, is_featured, track_stock, stock_quantity, low_stock_threshold, stock_status, weight and dimensions, published_at, and archive by soft delete.
  - **Status:** `draft` or `published`; archived means soft deleted.
  - **Money:** `DECIMAL(10,2)`. All arithmetic uses integer cents (`App\Support\Money`).
  - **Database checks:** MySQL CHECK constraints enforce sale below regular, price above zero, and valid statuses.
- **`category_product`:** a product can sit in several categories (e.g. "PS4 › Games › New" and "New Offers"). One is marked primary (breadcrumbs and the "type" filter).
- **`product_images`:** ordered, and position 0 is the main image. Imported images keep their URLs; uploaded ones live at `/storage/uploads/…`.
- **`product_specifications`:** real rows, one name per product. The old store's visible attributes become specifications. I chose rows over a JSON column, so specifications can be validated and edited one by one.
- **Inventory:**
  - **One number:** `stock_quantity` is the single stock value, and only `App\Services\Inventory` changes it. It locks the row, refuses to go below zero (`409 INSUFFICIENT_STOCK`), and writes an `inventory_movements` line (change, result, reason, owner, note).
  - **Availability:** `in_stock`, `low_stock` or `out_of_stock`, computed by one rule using the product's own threshold or the store default.
  - **Untracked products:** they use a manual `stock_status`.
  - **Privacy:** the storefront only sees exact stock when it's low ("Only 2 left").
- **Pricing** (`App\Services\Pricing`): the one selling-price rule. The sale price applies only inside its dates, and `ProductQuery` has the matching SQL expression for price filters and sorting. Store-wide offers will plug in here in Phase 9; product prices are never overwritten to fake an offer.
- **Catalog:**
  - **One response:** `/api/v1/catalog` carries all published products, visible categories and active brands, which keeps browsing and filtering instant in the SPA.
  - **Caching:** it's cached for 60 seconds, with an ETag (`304` when unchanged).
  - **Freshness:** any product, image, category or brand write clears the cache *after the transaction commits*, so a storefront request can't re-cache old data, and the change shows on the next request.
- **Product service** (`ProductService`): slug and SKU uniqueness (including archived products), sale below the regular price it will actually have, a sale that ends after it starts, a primary category that is one of the product's categories, starting stock as a movement line, and bulk actions (publish, unpublish, feature, unfeature, archive, restore).
- **Uploads** (`POST /api/v1/admin/uploads`):
  - **Accepted:** JPEG, PNG, WebP and GIF only, decided by the file's real content. SVG is refused because it can carry script.
  - **Limits:** at most 5 MB and 6000×6000 pixels.
  - **Storage:** a random UUID file name with the extension of the real type, on the public disk, served at `/storage/…`. `php artisan storage:link` was run (a junction on Windows), and Vite now proxies `/storage` to Laravel.
- **Import** (`php artisan dmd:import`, with taxonomy and then products):
  - **What's kept:** WooCommerce product ids, prices, sale and dates, status (a hidden catalog visibility becomes draft), featured, stock with an "import" movement, threshold, images, attributes as specifications, and creation and modification dates.
  - **Brand and categories:** taken from the product's categories; the primary category is the deepest one, never "New Offers".
  - **Edge cases:** duplicate SKUs are dropped with a warning; variable products and products without a price are reported and skipped.
  - **Running it again:** the same rows are updated, images and specifications are replaced, and stock moves by the difference.

**Migrations**
- `2026_10_06_000400_create_products_tables`: products (ids from 1,000,000), category_product, product_images, product_specifications, inventory_movements.

**Endpoints**

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/catalog | the whole storefront catalog, cached, with an ETag |
| GET | /api/v1/products | `category`, `category_path`, `brand`, `q`, `min_price`, `max_price`, `in_stock`, `on_sale`, `featured`, `ids`, `sort` (newest, price_asc, price_desc, name, featured), paginated |
| GET | /api/v1/products/{id} | detail: text, gallery, specifications, brand, dimensions |
| GET POST | /api/v1/admin/products | filters `q`, `status`, `category`, `brand`, `stock`, `featured`, `on_sale`, `archived`, `sort`; counts per status |
| GET PUT DELETE | /api/v1/admin/products/{id} | DELETE archives |
| POST | /api/v1/admin/products/{id}/restore · DELETE …/permanent · POST /api/v1/admin/products/bulk | |
| GET | /api/v1/admin/inventory | `level`=out, low, in or untracked; sold-out first; counts |
| PUT | /api/v1/admin/inventory/{id} | `stock_quantity` (stocktake) or `adjust` (±), `track_stock`, `low_stock_threshold`, `stock_status`, `note` |
| GET | /api/v1/admin/inventory/{id}/movements | stock history |
| POST | /api/v1/admin/uploads | multipart `file` |

**Tests added:** 22
- **Products:**
  - **Same rows everywhere:** the owner adds a product and it appears on its page, in the parent category, by category path, by brand, by name and SKU search, and in the catalog.
  - **Changes show at once:** an admin change shows immediately on the product page, in the category list and in the catalog (the ETag changes; an unchanged ETag gets a 304).
  - **Visibility:** drafts and archived products stay off the storefront; archive, restore and permanent delete work.
  - **Price validation:** zero, negative, three decimals, a sale at or above the price, dates in the wrong order, and lowering the price below an existing sale are all refused.
  - **Uniqueness:** SKUs are unique in any case and including archived products; slugs are unique.
  - **Categories and lists:** the primary category must be one of the product's categories; filters and sorting work; unknown values are refused.
  - **Admin tools:** bulk actions work; only the owner can manage products and stock.
- **Inventory:** one stock number drives availability on the product page, catalog, in-stock filter and admin; every change leaves a movement line with who and why; stock can never go below zero (through the API or the service); untracked products use their manual availability; the stock screen lists sold-out first, with counts.
- **Pricing:** a sale applies only inside its dates (`travel()` checks that it ends by itself), and the SQL filter agrees with PHP; money stays exact in cents.
- **Uploads:** stored under a random name with the real type (the browser's `../../evil name.png` is ignored); SVG with script, PHP disguised as PNG and oversized files are refused; buyers can't upload.
- **Import:** 187 products with ids, prices, stock, categories (primary not New Offers) and brand; importing again doesn't duplicate, and a changed price and stock follow with one movement for the difference; unsellable products are reported, not half-imported.

**Results**
- **Tests:** Laravel 108 of 108 (833 assertions). Lint passes and the storefront builds. Node isn't affected (no Node changes).
- **Real import from the local emulator into the dev database:** 187 products (all published), 187 images, 175 import movements (12 products had no stock), 44 on sale and 68 with a brand. Run twice, with identical counts.
- **Through the Vite proxy:** `/api/v1/catalog` returns 187 products, 105 categories and 10 brands, about 133 KB or 17 KB gzipped, with an ETag and public caching. Product 34198 shows price 28, regular price 32 and 13% off, in categories 291, 336 and 996 with primary 291. `/products?category_path=playstation/ps4/games&sort=price_asc` returns 17 products, cheapest first.

**Decisions**
- **Best-seller ordering and ratings:** these come from orders (Phase 7) and reviews (Phase 8). Nothing is copied into product rows ahead of time.
- **Stock privacy:** exact stock is private unless it's low, as before.
- **Brand visibility:** a product stays visible when its brand is inactive; only the brand's pages and filters go.

**Legacy dependencies removed:** none yet. That's the next phase.

**Blockers:** none.

**Next:** Phase 5, the storefront reads its catalog from Laravel.

## Phase 5: the storefront reads its catalog from Laravel (6 Oct 2026)

**Implemented**
- **One switch, one backend per build:** `VITE_BACKEND=laravel` (`npm run dev:laravel` on port 5175, `npm run build:laravel`, and the `.env.laravel` mode file, which holds no secrets).
  - **Laravel mode:** the storefront's catalog comes from `/api/v1/catalog`, that is from MySQL.
  - **Without the switch:** the app runs exactly as before on the legacy Node server.
  - **Default:** stays Node until Phase 11, because cart, checkout and account still depend on it until their phases.
- **API client** (`src/lib/laravelApi.js`):
  - **Session:** the cookie stays same-origin and HttpOnly.
  - **CSRF:** it fetches `/api/v1/sanctum/csrf-cookie` before the first write and sends `X-XSRF-TOKEN`; after a 419 it gets a fresh token and retries once.
  - **Errors:** Laravel's `{error: {code, message, fields}}` is raised as the existing `StoreApiError`, so the UI's error handling is unchanged.
- **Data layer:** the same exports the components already used (`PRODUCTS`, `DMD_GROUPS`, `MENU_SECTIONS`, `groupBySlug`, `BRAND_GROUPS`, `NEW_OFFERS`, `resolvePath`, `getBrand`, `catName`, `search`, the filters) are now filled from the API in Laravel mode.
  - `applyLaravelCatalog` maps API products to the storefront's product shape (`fromApi`).
  - `applyTaxonomy` rebuilds the menu tree: top-level categories become "Shop by category", brands become "Shop by brand" with their product lines, and "new-offers" becomes the offers row.
  - A brand's page lists every product of that brand (`inNode`), not just products filed under the brand's categories.
- **No bundled data in Laravel mode:**
  - **Snapshot unused:** `dmdCatalog.js` isn't used (the product list starts empty). It's still in the bundle until Phase 11 deletes it with the Node mode.
  - **Waiting for the catalog:** the app shows a short loading state until the catalog arrives (`CatalogGate`), or renders at once from this device's cached copy (`dmd:catalog:v2`, at most 24 hours old, only a cache).
  - **Store unreachable:** visitors see "The store can't be reached right now" with *Try again*. Nothing made-up is shown.
- **Freshness:**
  - **The catalog is never served stale:** it's sent with `Cache-Control: public, no-cache` plus an ETag. Browsers ask every time; an unchanged catalog costs a 304.
  - **Polling:** the storefront refreshes it every 5 minutes, when the tab is shown again and when the connection returns.
- **Product page:** in Laravel mode, details (description paragraphs, specifications, weight, dimensions) come from `/api/v1/products/{id}`. The legacy ratings call is skipped, because ratings will come with the catalog (Phase 8).
- **Duplicated taxonomy removed from the UI code:**
  - **Footer:** its category and brand columns are built from the store's tree (they were hand-written lists).
  - **`src/data/nav.js`:** its unused `MEGA_SHOP`, `MEGA_PLATFORMS` and `MEGA_BRANDS` (from the old template's taxonomy) are deleted.
  - **Home page:** its brand credits are built from the live brands.
- **Robustness:** every lookup of a named group (`playstation`, `other`, `laptops`) goes through `group()`. A category the owner archives or renames hides the matching home-page tile instead of crashing the page. The mega menu falls back to the first group.

**Endpoints:** `/api/v1/catalog` now sends `Cache-Control: public, no-cache` (see above). No new endpoints.

**Tests**
- **Laravel:** two cases added, so 110 tests in total.
  - **Image regression:** admin lists and the stock screen show images, alt text included.
  - **Catalog caching:** `/api/v1/catalog` sends `no-cache`.
- **Browser** (Laravel mode, port 5175, data imported in Phase 4):
  - **Home:** renders from MySQL ("187 products", "24 PlayStation products", "10 gear brands"), with no console errors.
  - **Category pages:** `/product-category/playstation/ps5/games` shows its New and Used chips with a product.
  - **Brand page:** `/product-category/razer` lists 7 products with product-line counts and "Only 2 left".
  - **Product page:** price $28, was $32, −13%, SKU, category and related products.
  - **Search:** "fc 2026" finds the product.
  - **Mobile menu:** built from the database tree.
- **Owner change seen by the storefront:** I signed in as the development owner and changed product 34198 through `/api/v1/admin` (name, price, sale price, stock 2). One reload showed the new name, price and "Only 2 left" on the product page, in search and in its category list. A second change ($25.50) also showed on the first reload. The product was then restored.
- **Node mode:** your dev server on 5173 still works: the Razer page shows the same counts, with no console errors.

**Bugs found and fixed**
- **Admin lists with images failed:** the admin product list, the stock screen and stock updates loaded images without their `alt` column, so they failed for any product that has an image. Strict mode caught it during browser testing. Fixed, with a regression test.
- **Stale catalog:** the catalog was cacheable for 30 seconds (`max-age=30`), so a reload could still show an old price. It now uses `no-cache` with the ETag.

**Development owner:** `php artisan dmd:owner --local-test` created `owner@dmdworld.local`. Its password is in `backend/storage/app/private/local-owner-login.txt`, which git ignores and which only works with `APP_ENV=local`.

**Blockers:** none.

**Next:** Phase 6, buyer profile, addresses and wishlist.

## Phase 6: buyer profile, addresses and wishlist (6 Oct 2026)

**Implemented (backend)**
- **Profile** (`GET`/`PATCH /api/v1/account`): first name, last name, phone, and the marketing preference.
  - **Changing the sign-in email:** it needs the current password, with its own limit of 5 wrong tries per 15 minutes, and a free address (`409 EMAIL_ALREADY_EXISTS`). Email verification resets, and the **old** address gets an "your sign-in email was changed" email (`EmailChanged`, with the new address masked).
  - **Fields nobody may set:** id, password and verification are ignored. Passwords only change through the password endpoints.
- **Addresses** (`addresses`): label, first and last name, phone, country (ISO-2, default LB), city, area, street, building, floor, notes, `is_default`.
  - **One default per buyer, enforced by MySQL:** a generated `default_for` column holds `IF(is_default, user_id, NULL)` and has a unique index.
  - **Default rules** (`AddressBook` service): the first address becomes the default; choosing another moves it, clearing the old one first in one transaction; removing the default promotes the most recent address. The default can't be changed through mass assignment.
  - **Limits:** at most 10 addresses. Markup (`<`, `>`) is refused in every field.
  - **Ownership:** every lookup is `where user_id = <session user>`, so another buyer's address is a 404. It can't be read, changed or even confirmed to exist. A `user_id` sent in the body is ignored.
- **Wishlist** (`wishlist_items`):
  - **No duplicates:** the primary key is (user_id, product_id). Saving again is harmless (`200`, `added: false`).
  - **Availability:** only published products can be saved. Archived or draft products drop out of the list but come back if restored; a deleted product's row goes with it (cascade). At most 200 items.
  - **Guest merge:** `POST /wishlist/merge` brings a guest's device wishlist into the account at sign-in. The server checks every id, and unknown or hidden ones are skipped.

**Implemented (storefront, Laravel mode)**
- **`src/lib/account.js`:** signing in, signing up, signing out, the session check, forgot, check and reset password, password change, profile, addresses and wishlist. Laravel's answers are mapped to the shapes the components already use; no buyer id is ever sent.
- **`StoreContext`:**
  - **Sign-in calls:** the session check, sign-in, sign-up and sign-out use Laravel.
  - **Wishlist sync:** at sign-in the device's guest wishlist is merged into the account in MySQL, then cleared from the device. Each heart is saved straight away and rolled back with a message if the store refuses. The legacy debounced whole-list save stays for Node mode only.
- **Account page:** forgot password and password change call Laravel. The Profile tab saves details and has a new **address book** (`components/account/AddressBook.jsx`): list, add, edit, remove and make default, styled like the rest of the account page. The legacy single-address fields stay for Node mode.
- **Reset page:** Laravel's link carries the token and the email. Both are read once and removed from the address bar, the link is checked before the form is shown, and the buyer is signed in after the reset.
- **Header:** the wishlist, compare and cart labels now say "1 item" rather than "1 items".

**Migrations:** `2026_10_06_000500_create_addresses_and_wishlist_tables`.

**Endpoints** (all need a buyer session):

| Method | Path |
|---|---|
| GET PATCH | /api/v1/account |
| GET POST | /api/v1/account/addresses |
| PATCH DELETE | /api/v1/account/addresses/{id} |
| POST | /api/v1/account/addresses/{id}/default |
| GET POST | /api/v1/wishlist |
| POST | /api/v1/wishlist/merge |
| DELETE | /api/v1/wishlist/{productId} |

**Tests added:** 16
- **Profile:** read and edit; forbidden fields ignored; an email change needs the current password and notifies the old address; the old email no longer signs in and the new one does; a taken email is refused; guests and the owner have no buyer profile.
- **Addresses:**
  - **Default:** exactly one, moved and promoted correctly; MySQL itself refuses a second default.
  - **Validation:** required fields, country format and markup are checked; the 10-address limit holds.
  - **Isolation:** buyer A can't list, change, make default or delete buyer B's address (404), and can't create one as B.
  - **Access:** a buyer session is required.
- **Wishlist:** persists across devices without duplicates; hidden products drop out and come back, deleted ones go, draft and unknown ones are refused; a guest wishlist merges (skipping drafts and unknown ids); each buyer has their own list; a buyer session is required.

**Results**
- **Tests:** Laravel 125 of 125 (965 assertions). Lint passes; the Node-mode and Laravel-mode builds pass.
- **Browser** (Laravel mode, 5175):
  - **Account flow:** created an account (sign-up goes to Laravel); the session survives a full reload; added an address, which became the default and looks right; saved a product (`POST /api/v1/wishlist` → 201); signed out (the wishlist count cleared) and back in (the wishlist came back from MySQL).
  - **Reset flow:** forgot password showed the neutral message. The reset email was written to Laravel's log with the link to `FRONTEND_URL/account/reset?token=…&email=…`. A link older than 60 minutes was correctly refused as expired. A fresh link opened the form, saved the new password and signed the buyer in.

**Bugs found and fixed**
- **`is_default` mass assignment:** strict mode caught `is_default` going through `fill()`. That field must only change through the address book's default logic.
- **Phase 5 regression: the legacy Node server could not start.**
  - **Cause:** `server/index.mjs` imports `src/data/dmdMenu.js`, which now imports `src/lib/backend.js`. That file read `import.meta.env.VITE_BACKEND`, and `import.meta.env` only exists in Vite.
  - **Effect:** every Node test failed (and two runs hung). Your running Node dev server was only unaffected because it started before the change.
  - **Fix:** `import.meta.env?.VITE_BACKEND`. The Node suite is back to 53 of 53.

**Not yet in Laravel mode:** the account page's Orders, Messages, Reviews and Stock alerts tabs still read the legacy server, and cart and checkout still use Node. They move in Phases 7–8. The default build (Node) is unaffected.

**Blockers:** none. Real email delivery needs SMTP settings.

**Next:** Phase 7, orders and order items.

## Phase 7: orders and order items (6 Oct 2026)

**Implemented (backend)**
- **`orders`:** order number, buyer (null for guests), status, currency, and subtotal, discount, shipping and total as `DECIMAL`. Also payment method and payment status, delivery method, a copy of the contact details (name, email, phone), a copy of the delivery address (country, city, area, street, building, floor, notes), the buyer's note, and a coupon code (filled in Phase 9).
  - **Guest access:** a guest-token hash and an idempotency hash, both with unique indexes.
  - **Timestamps:** placed, completed and cancelled.
  - **MySQL checks:** valid statuses (pending, processing, on_hold, completed, cancelled, refunded, failed) and valid payment statuses, non-negative money, and **total = subtotal − discount + shipping**.
- **`order_items`:** product id (set to null if the product is ever deleted), plus copies of the product name, SKU and image, unit and regular price, quantity, and the line subtotal, discount and total. A CHECK keeps quantity above 0. **Editing or deleting a product never changes an existing order.**
- **`order_status_history`:** every status change and the owner's private notes, with who made them.
- **`inventory_movements.order_id`:** now a foreign key to orders.
- **Checkout service:**
  - **Quote:** prices every line from MySQL through `Pricing` and flags `UNAVAILABLE`, `SOLD_OUT`, `LOW_STOCK` (with the quantity still available) and `TOO_MANY`.
  - **Placing an order:** one transaction (retried on deadlock). It locks the product rows in a fixed order, so two checkouts can't deadlock each other. It recomputes every price and total (anything the browser sends as a price, total, discount, status or user id is ignored), takes stock through `Inventory` with an `order` movement linked to the order, records history, and sends an order-confirmation email after commit.
  - **Idempotency:** the hash of (buyer or guest, client key) is unique. A retried or simultaneous duplicate submit gets the first order back (200, `replayed`); a guest reusing someone else's key gets `409 IDEMPOTENCY_CONFLICT`.
  - **Guest token:** an HMAC of the order and the key, so the browser that placed the order can always get it back on a retry. Only its SHA-256 is stored.
  - **Saved addresses:** a buyer's saved address is accepted only if it belongs to them (`ADDRESS_NOT_FOUND` otherwise), and a typed address can be saved to the address book.
- **Order service:**
  - **Allowed moves:** a transition table (for example processing → completed or cancelled; completed → refunded). Anything else is `409 STATUS_NOT_ALLOWED`.
  - **Locking:** the order row is locked during a change, so a buyer and the owner acting at the same time can't both win.
  - **Stock effects:** cancelling puts the stock back (`cancellation` movement); reopening a cancelled order takes it again, or is refused with `INSUFFICIENT_STOCK`.
  - **Payment:** completing a cash-on-delivery order marks it paid; refunding marks the payment refunded.
- **Buyer access:**
  - **Own orders only:** `GET /orders` lists only the session's own orders.
  - **Opening one order:** `GET /orders/{id}` works for its owner or with the guest token; anyone else gets 404.
  - **Cancelling:** only while pending. Cancelling twice never restocks twice.
  - **Private notes:** the owner's notes are never in buyer responses.
- **Owner:** an order list with filters (status, search by number, name, email or phone, customer, dates) and counts per status. The detail view adds next allowed statuses, the full history with who did what, and the buyer's track record. Also status and payment changes, and private notes.
- **Customers (owner):** registered buyers with their orders, money spent (paid orders only) and last order, plus guests grouped by email. The detail view has addresses, orders and wishlist size. The owner can correct a buyer's name, phone or email, but can never set their password.
- **Best sellers:** `units_sold` is computed from paid order lines (`withUnitsSold`), never stored. It's in the catalog, and `/products?sort=best` sorts by it.
- **Import** (`dmd:import`, parts `customers` and `orders`):
  - **Customers:** WooCommerce ids are kept and the password stays null, since WordPress hashes can't be read through the API; buyers choose a password with "Forgot password". Their saved address becomes the default.
  - **Orders:** ids and numbers are kept, statuses are mapped (on-hold becomes on_hold; bacs becomes bank_transfer), totals are kept (subtotal is total + discount − shipping, so the CHECK holds), and lines keep their names, SKUs and prices, with product ids where the product exists.
  - **History:** each order gets one history line, "Imported from the old store".
  - **Stock:** importing old orders never touches today's stock.
  - **Running it again:** the same rows are updated.

**Implemented (storefront, Laravel mode)**
- **`src/lib/orders.js`:** quote, checkout options, placing an order, list, view and cancel, mapped to the shapes the pages already use, including field errors mapped onto the checkout form's fields.
- **`useQuote`:** live line prices and problems now come from `/cart/quote`.
- **Checkout:** the options come from Laravel. A signed-in buyer chooses one of their **saved addresses** (the default is preselected) or "A new address" (which can be saved). The retry-safe idempotency key is sent as before.
- **Orders:** the order page loads the buyer's own order or a guest's with their device-held token, and cancels through Laravel. The account's Order history (with "Show older orders") comes from Laravel.

**Migrations:** `2026_10_06_000600_create_orders_tables`.

**Endpoints**

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/checkout/options | payment and delivery methods |
| POST | /api/v1/cart/quote | 120 per 10 minutes per address |
| POST | /api/v1/orders | guests too; 10 per hour per address and per account |
| GET | /api/v1/orders | the buyer's own orders, 20 per page |
| GET | /api/v1/orders/{id} | owner of the order, or `?token=` for a guest |
| POST | /api/v1/orders/{id}/cancel | pending only; `token` for guests |
| GET | /api/v1/admin/orders · /admin/orders/{id} | filters and counts; detail with history and customer stats |
| PUT | /api/v1/admin/orders/{id}/status · /payment | |
| POST | /api/v1/admin/orders/{id}/notes | private |
| GET PUT | /api/v1/admin/customers · /admin/customers/{id} | `type=registered` or `guest` |

**Tests added:** 24
- **Checkout:**
  - **Quote:** prices come from MySQL (the browser's price is ignored) and the problems are flagged.
  - **Guest order:** priced and stocked by the server; status, total, discount and user_id sent by the browser are ignored; the confirmation email is sent; the last unit is gone for the next buyer.
  - **Refusals:** low stock, too many and unavailable products are refused with nothing written.
  - **Rollback:** a failure halfway (the second stock change throws) rolls everything back (no order, no movements, stock unchanged).
  - **Retries:** a retried submit returns the same order and the same guest token, and someone else reusing the key is refused.
  - **Saved addresses:** a buyer orders to their own saved address; another buyer's address is refused; a typed address can be saved.
  - **Address rules and validation:** delivery needs an address, pickup doesn't, and bad contact details or payment methods are refused.
  - **Snapshots:** past orders keep the name, price and SKU after the product changes, and even after it's deleted.
  - **Sales counts:** paid orders count as sales in the catalog and in "best" sorting.
- **Buyer orders:** buyer A never sees buyer B's orders; a guest opens their order only with its token, and the token opens only that order; a pending order can be cancelled, its stock returns, and cancelling twice doesn't restock twice; a confirmed order can't be cancelled by the buyer; a guest cancels with their token; the owner's private notes never show.
- **Owner:**
  - **Orders:** list, filters and detail; status changes follow the rules (refused moves, cancel restocks, reopening re-reserves stock or is refused, completing a COD order marks it paid, history with notes and the owner's name); payment and private notes.
  - **Customers:** registered and guest customers with correct spending, and the owner can't set a buyer's password.
  - **Access:** buyers and guests get 401.
- **Import:** customers and orders arrive with their ids and history (passwords null, addresses, statuses and payment methods mapped, totals consistent, stock untouched); an imported customer resets their password and sees their old orders; importing again updates instead of duplicating; paid imported orders count as sales.

**Concurrency, with real processes**

The automated tests can't run two transactions at once, so I ran `race.php` against `dmd_world_testing` with 8 separate PHP processes released at the same instant.
- **The last unit:** all 8 tried to buy the last unit of a product. Exactly one got an order; seven were refused with `SOLD_OUT`. Stock ended at 0 with one movement.
- **Duplicate submits:** 6 processes sent the *same* checkout at once. One order was created and five got the same order back as replays. Stock moved once.

**Results**
- **Tests:** Laravel 149 of 149 (1185 assertions). Lint passes. The Laravel-mode, Node-mode and admin builds pass. Node 53 of 53.
- **Real import from the emulator into the dev database:**
  - **Customers:** 71, with 57 default addresses.
  - **Orders:** 387, with 564 lines (351 completed, 15 cancelled, 15 processing, 6 pending).
  - **Paid revenue:** $18,699.
- **Browser** (Laravel mode, 5175):
  - **Signed-in buyer:** added to cart, then at checkout the saved default address was preselected. Placed order #1000000, a real `/api/v1/orders` order of $28 cash on delivery. It showed in Order history; cancelled it from the order page.
  - **Stock and history:** MySQL showed stock 15 → 14 → 15 with `order` and `cancellation` movements, and history pending → cancelled.
  - **Guest:** placed order #1000001 with a typed address; the page reopened with the device-held token after a reload; the guest cancelled it.

**Bugs found and fixed**
- **Product import tests:** they ran the whole import, so they started failing once `customers` and `orders` became parts of it. They now import only taxonomy and products.

**Not yet in Laravel mode:** the account page's Messages, Reviews and Stock alerts tabs (Phase 8), and coupons (Phase 9; checkout hides the coupon field while `coupons_enabled` is false).

**Blockers:** none. Real order emails need SMTP settings.

**Next:** Phase 8, reviews and messaging.
