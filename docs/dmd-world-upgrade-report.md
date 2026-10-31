# DMD World upgrade: final report

Branch `laravel-migration`, local only. Nothing was pushed, merged or deployed, no production system was touched, no paid service was configured, and no real customer message, email or payment request was sent. No secrets are in this file.

## 1. Phases and commits

| Phase | Scope | Local commit |
|---|---|---|
| 1 | Homepage and branding: Laptop platform, hero copy, Marvo logo, About Us, contact number, WhatsApp on product pages | `c1ddaae` |
| 2 | Categories, single-choice filters, navigation, menu scroll lock, Electrical Appliances | `e5541bf` |
| 3 | Product variations, Buy Used (condition grades), WhatsApp on product cards | `bcb8ab3` |
| 4 | Weekly Offers (homepage, admin state filter, exact timing), Whish Money (manual payment confirmed by the owner) | `504c6fe` |
| 5 | Phone numbers, back-in-stock requests, abandoned checkout reminders, order notifications, product add-ons, messaging layer | `08329c0` |
| 6 | Shopping assistant (catalog-grounded, English and Arabic, AI-ready but no AI connected), GA4, admin Analytics | `95b87f6` |
| 7 | Full QA, this report, deployment notes | the Phase 7 commit (documentation only) |

## 2. What each phase added (Phases 5 to 7)

Phases 1 to 4 are described in `docs/enhancements-progress.md` and their commits.

**Phase 5**
- **Back in stock:** on a sold-out product or variant, "Notify me when it's available" (guests and signed-in buyers), by email or WhatsApp, with an explicit consent box and a withdraw link.
  - Email requests are sent when stock returns, once per request.
  - WhatsApp requests wait in **Admin › Follow-ups**, with an "Open WhatsApp" link and "Mark as told", until a messaging provider exists.
- **Abandoned checkout:** an unticked "Email me one reminder if I don't finish this order" box at checkout.
  - It is off store-wide until the owner switches it on (**Admin › Settings › Unfinished checkouts**, delay 15 minutes to 7 days, default 60).
  - Each saved checkout gets one reminder, and an email address gets at most one per day.
  - Any order from the same checkout, email or account cancels the reminder.
  - The reminder link restores the cart, and personal details are erased after 30 days.
  - Results are in **Admin › Follow-ups › Unfinished checkouts**.
- **Order notifications:** customers get an email when an order is confirmed, sent out or ready to collect, completed, cancelled, refunded, or paid (Whish or bank transfer). The owner can switch these off.
  - The order confirmation now says when payment is awaited (Whish, bank transfer).
  - New admin action: "Mark out for delivery / ready to collect".
  - The owner's private WhatsApp number for new orders is saved, but no message is sent until a provider is connected.
- **Product add-ons:** the owner picks up to 8 recommended products per product (**Admin › Products › Recommended add-ons**).
  - They appear as "Complete your setup" on the product page and "Goes well with your order" in the cart.
  - The panels are dismissible and nothing is added to the cart unless the buyer taps Add.
- **Phone numbers:** checkout and account keep their existing phone fields and validation (+961 and international formats).
  - New phone fields are stored in international form; a number without a country code is read as Lebanese.
  - The owner's private number is never shown in the shop.
- **Messaging:** customer conversations still use the existing live chat and Messages. The new outbound layer only sends through a configured provider and records each attempt's real outcome.

**Phase 6**
- **Shopping assistant:** a third option in the existing contact button, next to Live chat and WhatsApp.
  - It answers from the store's own data: real products, prices and stock, and the delivery, payment and contact settings. It never invents prices, specs, stock or policies.
  - It works in English and Arabic (Arabic answers display right to left).
  - Returns, warranty, order questions and anything it can't match go to live chat (with the question carried over) or WhatsApp.
  - It is rate limited (10 per minute, 150 per day per address).
  - Only daily counts are stored; never the questions or who asked.
- **AI provider:** a provider interface exists, but none is connected (see section 6).
- **GA4:** off until a Measurement ID is entered in Admin › Settings, and then only for visitors who accept the consent bar.
  - Events: page_view (path only), view_item, view_item_list, search, add_to_cart, remove_from_cart, begin_checkout, and purchase (once per order).
  - All values are in USD, and no personal data is sent.
- **Admin › Analytics:** GA4 setup state and steps, a pointer to the dashboard for sales figures (from the store's own orders), and assistant usage and AI budget.

**Phase 7:** full regression (section 4), deployment notes updated (`docs/deployment.md`, `backend/.env.example`), and this report.

## 3. Database migrations (all additive)

| Migration | Phase | What it does |
|---|---|---|
| `2026_10_31_001800_add_electrical_appliances_category` | 2 | Adds the Electrical Appliances category |
| `2026_10_31_001900_add_condition_to_products` | 3 | Adds a used-condition grade and note to products |
| `2026_11_01_000100_extend_stock_alerts` | 5 | Variant, guest, phone, consent, token and cancel fields on back-in-stock alerts (existing alerts keep working) |
| `2026_11_01_000200_create_checkout_recoveries_and_order_updates` | 5 | `checkout_recoveries` and `outbound_messages` tables; `orders.dispatched_at` and `orders.updates_by_phone` |
| `2026_11_01_000300_create_product_addons` | 5 | `product_addons` table |
| `2026_11_01_000400_create_assistant_usage` | 6 | `assistant_usage` table (daily counts) |

All six were applied to the **local development database** (`dmd_world`) with `php artisan migrate`, never `migrate:fresh`. Row counts of products, orders, order items, users, alerts, categories, brands, inventory movements, reviews, conversations, messages and settings were the same before and after.

Destructive test setup used only `dmd_world_testing`, after checking the database name, host and environment.

## 4. Tests

| Suite | Result |
|---|---|
| Laravel (PHPUnit, on `dmd_world_testing`) | 316 passed, 1 failed: the pre-existing `UploadTest` failure described below |
| Storefront unit tests (`node --test src/lib/*.test.js`) | 39 / 39 |
| Admin unit tests | 19 / 19 |
| ESLint (storefront and admin) | clean |
| Production builds (both apps, into a scratch folder) | succeed |
| Browser, Phase 1 homepage and branding (dev site) | 37 / 37 |
| Browser, Phase 2 categories and navigation (dev site) | 56 / 56 |
| Browser, WhatsApp on product pages / on cards (dev site) | 37 / 37, 17 / 17 |
| Browser, Phase 3 variations and Buy Used (test site) | 42 / 42 |
| Browser, Phase 4 Weekly Offers and Whish (test site) | 15 / 15 |
| Browser, Phase 5 notifications and add-ons (test site) | 32 / 32 |
| Browser, Phase 6 assistant and GA4 (test site) | 23 / 23 |

New automated tests use fake providers, so no message is sent and no AI is called:
- `BackInStockRequestTest`, `CheckoutRecoveryTest`, `OrderNotificationTest`, `ProductAddonTest` and `ShoppingAssistantTest` (Laravel);
- `addons.test.js` and `analytics.test.js` (storefront).

In the browser checks, Google's hosts were blocked, so no data reached Google.

**Pre-existing failure (not caused by these phases):** `UploadTest` › "only mp4 and webm videos up to 30 mb are accepted". On this Windows machine PHP's `finfo` cannot open the temporary upload file. It failed the same way before Phase 1.

## 5. Security, privacy and performance review

**Authorization.** Every new admin endpoint is behind the admin session. Tests confirm guests and buyers get 401 on:
- Follow-ups;
- checkout recoveries;
- analytics;
- order dispatch;
- stock-alert requests.

**Public endpoints.** Back-in-stock requests, checkout recovery and the assistant are rate limited.
- Back-in-stock requests are also limited per contact.
- Withdraw and recovery links use 40-character random tokens.
- Opening a recovery link returns only the cart items, never contact details.
- Someone else typing the same email never receives an existing checkout's link.

**Privacy.**
- Consent is required for back-in-stock requests and checkout reminders.
- Checkout reminder details are erased after 30 days.
- Withdrawn checkouts keep no contact details.
- GA4 is consent-gated, sends paths without query strings (which can hold reset or order tokens), and sends no names, emails or phone numbers.
- The assistant stores counts only.
- The owner's private number and the AI budget are not in the public catalog.

**Honest delivery.** Without a provider, WhatsApp/SMS is never shown as sent. Failed sends are recorded and retried by the scheduler.

**CSP.** `deploy/Caddyfile` allows Google's tag and analytics hosts. They are used only after an ID is set and the visitor consents.

**Not run.** `npm audit` and `composer audit` need network access to registries and were not run here. Run them before deploying.

**Performance.**
- Storefront main bundle: 343 kB (107 kB gzipped).
- New code is in route chunks or small components (product page 35 kB, checkout 15 kB).
- Admin main bundle: 270 kB (83 kB gzipped); new pages are lazy-loaded (Analytics 5 kB, Follow-ups 8 kB).
- The catalog adds only an `addon_ids` list per product.

**Responsive.** Phone-width checks (390 px) cover:
- Weekly Offers;
- the add-on panel;
- the consent bar, which stays clear of the contact button;
- the assistant.

## 6. Blocked integrations and decisions needed

1. **WhatsApp/SMS provider (credentials and choice).** No provider is connected (`MESSAGING_DRIVER=none`). To enable automatic WhatsApp:
   - choose one (e.g. WhatsApp Business Platform or an SMS gateway);
   - add a driver implementing `backend/app/Services/Messaging/Messenger.php`;
   - put its credentials in the server's `.env`.

   Until then, WhatsApp back-in-stock requests are answered by hand from Follow-ups, the owner's order number is unused, and the checkout doesn't offer WhatsApp updates.
2. **AI provider and budget (approval).** No AI is connected (`ASSISTANT_DRIVER=none`) and nothing is billed. The "$50" budget's period (per day, per month or in total) is **unconfirmed**. The AI is called only when both an amount and a period are set in Admin › Settings and a provider driver exists.
3. **Whish Money logo.** The official logo isn't in the project. Save it as `public/images/payments/whish-money.svg` and checkout shows it automatically. No stand-in is used.
4. **GA4 Measurement ID.** Create a GA4 web data stream and paste the `G-…` ID in Admin › Settings › Analytics & assistant. If the live host (Hostinger) sends its own CSP header, it must allow:
   - `https://www.googletagmanager.com` in script-src;
   - `https://*.google-analytics.com`, `https://*.analytics.google.com` and `https://www.googletagmanager.com` in connect-src.
5. **Checkout reminders.** They are off by default. The owner decides whether to switch them on, and the delay.
6. **From Phase 2.** 11 products sit only in retired categories (Phone Accessories, Smart Watches) and need review. "Gaming Tables" needs its own category before it shows.
7. **Email.** All customer and owner emails need production SMTP settings (`MAIL_*`); until then they are only logged.

## 7. Credentials and settings needed (names only)

| What | Where | Needed for |
|---|---|---|
| `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` | server `.env` | every email (confirmations, order updates, back in stock, reminders) |
| `MESSAGING_DRIVER` + provider credentials | server `.env` (future) | automatic WhatsApp/SMS |
| `ASSISTANT_DRIVER` + provider API key | server `.env` (future, after approval) | AI-worded assistant answers |
| AI budget amount and period | Admin › Settings | any AI use |
| GA4 Measurement ID (not a secret) | Admin › Settings | Google Analytics |
| Owner's WhatsApp number for new orders | Admin › Settings | owner alerts (once a provider exists) |

## 8. Deployment steps (not done; for when you decide to deploy)

1. Back up the production database and `backend/storage`.
2. Merge `laravel-migration` as you normally do. These commits are local only.
3. On the server, run `npm ci && npm run build:all` (or build locally and ship `dist/` and `admin/dist/` as before).
4. In `backend/`, run `composer install --no-dev --optimize-autoloader`, then `php artisan migrate --force` (the six additive migrations above), then `php artisan config:cache && php artisan route:cache && php artisan event:cache`.
5. Keep the cron for `php artisan schedule:run` running every minute. It now also runs `dmd:checkout-reminders`.
6. Apply the CSP hosts from section 6, item 4 if the host sets its own CSP.
7. Smoke test:
   - product page with a sold-out variant (Notify me);
   - add-ons;
   - checkout (with the reminder box, if switched on);
   - Whish order;
   - admin Follow-ups, Analytics and Settings;
   - the assistant in the contact button.

## 9. Left as found

- The uncommitted `package-lock.json` change and the 44 untracked build files in `dist/assets` and `admin/dist/assets` were not touched or committed.
- `backend/.env` was not changed.
