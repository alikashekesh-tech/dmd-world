# DMD World · Command (owner back office) and buyer accounts

Two separate doors into the same WooCommerce store, both served by the small Node server in `server/`:

| | Who | UI | API | Session |
|---|---|---|---|---|
| **Owner** | the single owner | `/admin` (this folder) | `/admin/api` | `dmd_admin` cookie, `Path=/admin`, owner password |
| **Buyers** | store customers | the storefront (`src/`) | `/api` | `dmd_buyer` cookie, `Path=/api`, their WordPress account |

```
admin/                    owner UI (dashboard + 15 sections)
server/index.mjs          owner API, WooCommerce client, hosting
server/buyer.mjs          buyer API: accounts, orders, wishlist, reviews, messages
server/dev/               local WooCommerce emulator (test data only) + email outbox
shared/passwordPolicy.js  the one password policy, used by server, admin and storefront
wordpress/dmd-buyer-auth  WordPress plugin that checks buyer passwords and sends reset emails
```

## Run it locally (emulator)

Run each command in its own terminal. First the emulator:

```bash
npm --prefix server run emulator
```

Then the server:

```bash
npm --prefix server start
```

Then the storefront:

```bash
npm run dev
```

- Owner admin: `http://localhost:5173/admin/` (or build it with `npm --prefix server run build:admin`, then open `http://localhost:8787/admin/`). The password is in `server/dev/LOCAL-TEST-LOGIN.txt`.
- Storefront: `http://localhost:5173`. Create a buyer account under Account → Create an account.
- Password-reset emails from the emulator are written to `server/dev/outbox/` instead of being sent.

## Connect a staging store

1. Staging WordPress: WooCommerce → Settings → Advanced → REST API → Add key, **Read/Write**.
2. In `server/.env` set `WOO_URL`, `WOO_KEY`, `WOO_SECRET` and `WOO_ENV=staging`. Start with `WOO_READ_ONLY=true` to look before changing anything.
3. Owner password: `npm --prefix server run setup -- --password "…"`. It needs 8+ characters with upper and lower case, a number and a special character.
4. Buyer accounts: install the plugin in `wordpress/dmd-buyer-auth` (see its README), run `npm --prefix server run setup -- --buyer-secret`, and set `STOREFRONT_URL`.
5. Optional image uploads: `WP_USER` and `WP_APP_PASSWORD`.
6. Restart the server.

In production, serve the storefront and the server from the same site (the storefront's `/api` going to this server) over HTTPS, with `COOKIE_SECURE=true`.

## Password rules (everywhere)

At least 8 characters, an uppercase letter, a lowercase letter, a number and a special character (`shared/passwordPolicy.js`).
- **Where they apply:** buyer sign-up, buyer password change, buyer password reset and the owner password change.
- **How:** every form shows the rules live, has a confirm field and a show/hide button. The server enforces the same rules, and so does the WordPress plugin on the WordPress site.

## How buyer accounts stay separate

- **Accounts:** each one is a real WooCommerce customer with a unique email (enforced by WordPress), its own password, profile, phone, addresses, orders, wishlist (`dmd_wishlist` on the customer), reviews and messages.
- **No borrowing an ID:** every `/api/me` route takes the customer ID from the server-side session, never from the request. Opening someone else's order, thread or review returns *not found*.
- **Sessions:** these are random tokens; the server keeps only their hash. Logging out ends the session. Changing or resetting a password signs out every other device.
- **Shared devices:** signing out clears the account's wishlist and orders from the screen.
- **Owner and buyers:** a buyer cookie can't open `/admin/api`, and the owner cookie can't act as a buyer. Only WordPress `customer` accounts can sign in to the storefront.
- **Guest checkout:** guests can still check out. They reopen their confirmation with WooCommerce's private order key.

## Security hardening

- **Network:**
  - The server and the emulator listen on `127.0.0.1` only (`HOST`). Put nginx or Caddy in front with HTTPS for the public site.
  - Set `TRUST_PROXY=true` only behind that proxy.
  - Set `COOKIE_SECURE=true` in production. This also sends HSTS.
- **Headers:**
  - The admin page gets a strict Content-Security-Policy (scripts from itself only, no framing) plus `nosniff`, `no-referrer`, `X-Frame-Options: DENY` and COOP.
  - API responses are `no-store` and can't be framed or sniffed.
- **Owner sessions:**
  - The cookie is HttpOnly, `SameSite=Strict` and limited to `/admin`, signed with the session secret plus the password hash.
  - Changing the password signs out every other device, and logout revokes the token on the server.
  - Lockout after 5 failures per address, plus a store-wide brake on bursts of failures.
  - New password hashes use stronger scrypt settings; older ones are upgraded at the next sign-in.
- **Buyer sessions:**
  - Random tokens; only their hash is stored, in a file readable by the owner only.
  - At most 10 devices per account. Password change or reset signs out the others.
  - Separate limits on sign-in, sign-up, reset, orders, reviews and messages, plus a per-address API limit.
- **Input:**
  - Every route ID is checked to be a plain number (or a strict pattern) before it can reach a WooCommerce URL.
  - Writes must be JSON, and cross-site or foreign-origin writes are refused.
  - Request bodies are size-limited. Names, addresses and notes are stripped of markup.
  - Stored image URLs must be http(s), and links built from data render only as app routes or http(s).
- **Checkout:** prices, stock, product type and visibility always come from WooCommerce, with at most 10 of each item. Guest order keys are compared in constant time and forgotten by the device after 30 days.
- **Robustness:**
  - Malformed requests and cookies get clean errors instead of crashing the server.
  - Slow or oversized requests are cut off.
  - Static files can't be read from outside `admin/dist`.
- **WordPress plugin:**
  - The shared secret is compared in constant time, and unknown accounts take as long to answer as wrong passwords.
  - Its own limits: 10 failures per login per 15 minutes, and 3 reset emails per account per hour.

For the storefront's static host, also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and HSTS. Keep WordPress, WooCommerce and plugins updated, back up the database, and never commit `server/.env`.

## Buyer reviews

- **Where buyers write them:** buyers who are signed in review from the product page or from **Order history → Review**. A review has 1–5 stars, a title and text.
- **Storage:** reviews are real WooCommerce reviews. The title is kept as the review's bold first line, because WooCommerce has no title field.
- **Moderation:** new reviews are **Pending** and only appear on the product page after you approve them in Admin → Reviews, where you can also unpublish or delete them.
- **Verified purchase:** WooCommerce sets it when the reviewer bought the product.
- **Ratings:** the product's average and count come from approved reviews.
- **Limits:** one review per buyer per product. Photo uploads aren't included, because they need a plugin.

## Checkout and orders

- **Orders:** checkout creates a real WooCommerce order: Pending, cash on delivery or bank transfer, delivery or pick-up, with an optional message.
- **Pricing and stock:** prices, stock and totals come from WooCommerce. The browser's prices are ignored, and sold-out items are refused.
- **What the owner sees:** the order appears in Admin → Orders, and the buyer's message appears in Messages.
- **Talking with the buyer:** buyers can also message you about their orders from their account. Your replies are emailed to them and show in their account.

## Known limits

- **Hero slider and banners** are designed in Elementor, so the Homepage screen links to the page builder.
- **Abandoned carts aren't included**, because the store has no cart-tracking plugin.
- **Blocking an account or setting a password for a buyer** is done in WordPress → Users. Buyers reset their own passwords from the storefront.
- **The storefront's product catalog is still a snapshot** (`src/data/dmdCatalog.js`). Product edits in the admin reach WooCommerce, and so do orders, accounts and reviews. Prices and stock are always re-checked live at checkout, but product pages show snapshot data until the catalog is loaded live.
