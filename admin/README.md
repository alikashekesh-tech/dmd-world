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
server/test/              unit and end-to-end tests (npm test)
shared/passwordPolicy.js  the one password policy, used by server, admin and storefront
wordpress/dmd-buyer-auth  WordPress plugin: buyer passwords, reset and back-in-stock emails
deploy/                   example Caddy and systemd configuration
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
- Vite forwards `/api` and `/admin/api` to the server (`vite.config.js`), so the storefront works on any port, exactly like production. Set `DMD_API_ORIGIN` if the server isn't on `127.0.0.1:8787`.
- Emails from the emulator (password resets, back-in-stock) are written to `server/dev/outbox/` instead of being sent.

### Checks

```bash
npm run check
```

That runs the linter (`npm run lint`), the tests (`npm test`) and both builds. The tests start their own emulator and server on free ports with temporary data, so they never touch `server/.env` or `server/data/`. They cover sign-in and lockouts, owner/buyer separation, order privacy, cross-site refusals, the live catalog, quotes and coupons, retry-safe orders, cancelling, reviews and stock alerts.

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

## What buyers get

- **Live catalog:** prices, sales, stock, photos and new products come from WooCommerce, and product pages show the store's own description and attributes (`/api/catalog`, refreshed every few minutes and cached on the device), so owner edits show up on the storefront within minutes. The bundled snapshot is only a fallback. Menu counts match what each page lists.
- **Honest checkout:**
  - **Live check:** the cart and checkout ask the server for a live quote (prices, stock, discount) and point out items that sold out or are running low, with one-click fixes.
  - **Codes:** coupons created in Admin → Offers can be redeemed at checkout, with WooCommerce's rules (expiry, minimum and maximum spend, usage limits, products and categories).
  - **No double orders:** "Place order" can't create two orders. A retried submit (double tap, dropped connection) returns the first order.
  - **Typing is kept:** the details stay in the tab if the page is refreshed.
- **After ordering:**
  - **Order page:** a progress timeline (placed → confirmed → delivered), the discount, and updates from DMD.
  - **Cancelling:** buyers and guests can cancel an order DMD hasn't confirmed yet. The owner sees the cancellation in the order's history and in Messages.
- **Account:**
  - **Orders:** "Buy again" on any order, and older orders load on demand.
  - **Replies:** a badge shows new replies from DMD, and the "Message DMD" link opens that order's thread.
  - **Stock alerts:** a list of the products the buyer is waiting for.
- **Back-in-stock emails:** on a sold-out product, signed-in buyers choose "Email me when it's back". Restocking emails them through the WordPress plugin (1.1), and Admin → Inventory shows how many buyers are waiting for each product.
- **Small things:**
  - **Remembering:** recently viewed products appear on the home page and product pages, and wishlist items can go to the cart in one tap.
  - **Undo:** clearing or removing cart items can be undone.
  - **Low stock:** "Only N left" is shown only when stock really is low.
- **Search and sharing:**
  - **Titles and descriptions:** every page has its own title and description, and private pages are `noindex`.
  - **Search engines:** product pages carry Product structured data (price, availability, rating), and the server publishes `robots.txt` and a live `sitemap.xml`.
  - **Link previews:** social preview tags.
- **Resilience:**
  - **Store unreachable:** shows a clear message with "Try again" (and retries when the connection returns), never an endless "Checking your account…".
  - **Page errors:** a failing page shows a reload button instead of a blank screen, and pages load on demand (smaller first download).

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
  - Lockout after 5 failures per address, plus a store-wide brake on bursts of failures. Devices the owner has signed in on before skip the store-wide brake, so a stranger flooding wrong passwords can't lock the owner out.
  - Changing the password in Settings needs the current one, with its own limit (5 wrong tries per 15 minutes).
  - New password hashes use stronger scrypt settings; older ones are upgraded at the next sign-in.
- **Buyer sessions:**
  - Random tokens; only their hash is stored, in a file readable by the owner only.
  - At most 10 devices per account. Password change or reset signs out the others.
  - Separate limits on sign-in, sign-up, reset, orders, quotes, cancelling, reviews, messages and stock alerts, plus a per-address API limit. All limits are bounded in memory.
  - A wrong "current password" while signed in (changing email or password) is limited per account, so a stolen session can't be used to guess it.
  - A password-reset token is removed from the address bar as soon as the page reads it.
- **Input:**
  - Every route ID is checked to be a plain number (or a strict pattern) before it can reach a WooCommerce URL.
  - Writes must be JSON, and cross-site or foreign-origin writes are refused.
  - Request bodies are size-limited. Names, addresses and notes are stripped of markup.
  - Stored image URLs must be http(s), and links built from data render only as app routes or http(s).
- **Checkout:** prices, stock, product type and visibility always come from WooCommerce, with at most 10 of each item. Guest order keys are compared in constant time and forgotten by the device after 30 days.
- **Robustness:**
  - Malformed requests and cookies get clean errors instead of crashing the server.
  - Slow or oversized requests are cut off.
  - Static files can't be read from outside `admin/dist` (or `dist/`), and a missing script answers 404 rather than an HTML page.
  - The server's own files (admin state, buyer sessions) are written atomically. A file that can't be read is kept aside and the server starts with empty data, instead of refusing to start.
  - The development server refuses to serve `server/`, `wordpress/`, `.env` files and logs.
- **Logging:** errors, slow requests and refusals (401/403/429, with the address) are always logged. Every request is logged with `LOG_REQUESTS=true`. Query strings are never logged, because they can carry order keys and reset tokens.
- **WordPress plugin:**
  - The shared secret is compared in constant time, and unknown accounts take as long to answer as wrong passwords.
  - Its own limits: 10 failures per login per 15 minutes, and 3 reset emails per account per hour.

For the storefront's static host, also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and HSTS. Keep WordPress, WooCommerce and plugins updated, back up the database, and never commit `server/.env`.

## Production deployment

1. **Build:** `npm ci && npm run build:all` (storefront in `dist/`, admin in `admin/dist/`).
2. **Configure:** in `server/.env`, set `SERVE_STOREFRONT=true`, `TRUST_PROXY=true`, `COOKIE_SECURE=true` and `STOREFRONT_URL=https://your-domain`. One Node process then serves the storefront pages, `/api`, `/admin`, `robots.txt` and `sitemap.xml`, with compression and long-lived caching for hashed assets.
3. **Put it behind HTTPS:** use Caddy or nginx; `deploy/Caddyfile` is a working example.
4. **Run it as a service:** `deploy/dmd-world.service` is a hardened systemd unit. The server stops gracefully on SIGTERM: it finishes open requests and saves buyer sessions.
5. **Monitor:**
   - `/healthz` answers 200 while the server is up (the reverse proxy uses it).
   - `/healthz?store=1` also needs WooCommerce to answer (use it for uptime alerts).
6. **Back up** `server/data/` along with the WordPress database.

Hosting the storefront elsewhere (a static host) also works: forward `/api` to this server on the same domain, and send the security headers listed above.

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
- **Stock that changes through orders** can take up to 30 minutes to show in the storefront catalog: WooCommerce doesn't mark the product as modified then. The cart and checkout always check stock live, so nobody can order what's gone.
- **Card payments** aren't taken online. Orders are cash on delivery or bank transfer, confirmed by DMD.
