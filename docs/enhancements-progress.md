# DMD World enhancements: progress

Local development only (branch `laravel-migration`). Nothing here has been pushed or deployed. No secrets in this file.

| Phase | Scope | Status | Local commit |
|---|---|---|---|
| 1 | Homepage & branding (Laptop platform, hero copy, Marvo logo, About Us, contact number, WhatsApp on product pages) | Done | `c1ddaae` |
| 2 | Categories, single-choice filters, navigation, menu scroll lock, Electrical Appliances | Done | `e5541bf` |
| 3 | Product variations, Buy Used, WhatsApp on product cards | Done | `bcb8ab3` |
| 4 | Weekly Offers (homepage, admin state filter, exact offer timing), Whish Money (manual payment, admin confirmation) | Done | `504c6fe` |
| 5 | Phone numbers, back-in-stock, abandoned checkout, order notifications, add-ons, messaging | Done | `08329c0` |
| 6 | Shopping assistant (catalog-grounded, AI-ready), GA4, admin analytics | Done | `95b87f6` |
| 7 | Full QA and final report (`docs/dmd-world-upgrade-report.md`) | Done | the Phase 7 commit |

## Known blockers and decisions

- **Pre-existing test failure:** `UploadTest` › "only mp4 and webm videos…" fails on this Windows machine (PHP `finfo` can't open the temp upload). Unrelated to these phases.
- **Production:** each phase's migrations run on deploy (`php artisan migrate`); `dist/` and `admin/dist/` must be rebuilt and committed before a deploy. Not done.
- **Phase 2:** 11 products sit only in retired categories (Phone Accessories, Smart Watches) and await review; "Gaming Tables" needs its own category before it shows.
- **Phase 3:** if the owner saved a custom top menu, Buy Used appears only once switched on in Admin › Menu.
- **Phase 4:** the official Whish Money logo isn't in the project. Checkout shows it automatically once saved as `public/images/payments/whish-money.svg`; no stand-in logo is used. Whish has no merchant API here: payments are confirmed by hand on the order (Mark as paid). If the owner saved custom payment methods in Settings, Whish Money must be ticked there.
- **Phase 4:** Weekly Offers shows the owner's hand-picks (Admin › Homepage), else products in a running offer (Admin › Offers), else products on their own sale. "See all" opens New Offers, which now also lists every product on offer.
- **Phase 5, messaging provider (blocked on credentials and a business decision):** no WhatsApp/SMS provider is connected (`MESSAGING_DRIVER=none`). Every WhatsApp/SMS path is built behind `backend/app/Services/Messaging/Messenger.php` and only sends through a configured provider. Until one is chosen (e.g. WhatsApp Business Platform or an SMS gateway) and its credentials added server-side, nothing is sent by phone and nothing is reported as sent: phone back-in-stock requests wait in Admin › Follow-ups for the owner to answer with “Open WhatsApp” (a chat the owner sends), the owner’s private order number is saved but unused, and the checkout doesn't offer WhatsApp order updates. Emails work through the existing mailer.
- **Phase 5, scheduler:** reminders and retries run from `php artisan schedule:run` (every minute by cron on the server): `dmd:stock-alerts` and the new `dmd:checkout-reminders`, every ten minutes.
- **Phase 5, checkout reminders:** off by default (Admin › Settings › Unfinished checkouts). Only customers who tick “Email me one reminder” are saved; one reminder after the owner’s delay (default 60 minutes), never after an order from the same checkout, email or account; personal details erased after 30 days. Results in Admin › Follow-ups.
- **Phase 5, phone numbers:** checkout and account keep the phone fields they already had (validated: +961 and international formats). New phone fields (back-in-stock, reminders, the owner's private number) are stored in international form (`+96170123456`; a number without a code is read as Lebanese). Existing order and account phones are kept as typed. The owner's private number is never shown in the shop and is separate from the public contact number.
- **Phase 5, local database:** the three Phase 5 migrations were applied to the local development database (additive only; row counts checked before and after).
- **Phase 6, AI provider (blocked on a business decision):** the shopping assistant (contact button › Shopping assistant) answers from the catalog and the store's settings only, in English and Arabic, and hands everything else to live chat or WhatsApp. No AI provider is connected (`ASSISTANT_DRIVER=none`) and none is billed. Connecting one needs: an approved provider, a driver implementing `backend/app/Services/Assistant/AssistantProvider.php`, its key in the server's `.env`, and a budget **with its period** in Admin › Settings › Analytics & assistant. The "$50" budget's period (per day, per month or in total) is unconfirmed, so nothing is assumed: without both values the AI is never called.
- **Phase 6, GA4:** off until a Measurement ID (`G-…`) is added in Admin › Settings, and then only for visitors who accept analytics cookies (a consent bar asks). Events: page_view (path only, never query strings), view_item, view_item_list, search, add_to_cart, remove_from_cart, begin_checkout, purchase (once per order, USD). No names, emails, phone numbers or tokens are sent. `deploy/Caddyfile`'s CSP now allows Google's tag and analytics hosts; on Hostinger, any CSP header there needs the same hosts (`https://www.googletagmanager.com` in script-src; `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com` in connect-src).
- **Phase 6, local database:** the `assistant_usage` migration was applied to the local development database (additive; row counts unchanged).
