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
