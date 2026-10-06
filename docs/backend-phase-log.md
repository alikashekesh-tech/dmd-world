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
