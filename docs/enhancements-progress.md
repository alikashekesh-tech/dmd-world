# DMD World enhancements: progress

Local development only (branch `laravel-migration`). Nothing here has been pushed or deployed. No secrets in this file.

| Phase | Scope | Status | Local commit |
|---|---|---|---|
| 1 | Homepage & branding (Laptop platform, hero copy, Marvo logo, About Us, contact number, WhatsApp on product pages) | Done | `c1ddaae` |
| 2 | Categories, single-choice filters, navigation, menu scroll lock, Electrical Appliances | Done | `e5541bf` |
| 3 | Product variations, Buy Used, WhatsApp on product cards | Done | `bcb8ab3` |
| 4 | Weekly Offers (homepage, admin state filter, exact offer timing), Whish Money (manual payment, admin confirmation) | Done | the Phase 4 checkpoint commit |
| 5 | Phone numbers, back-in-stock, abandoned checkout, order notifications, add-ons, messaging | In progress | — |
| 6 | AI shopping assistant, GA4, admin analytics | Not started | — |
| 7 | Full QA and final report | Not started | — |

## Known blockers and decisions

- **Pre-existing test failure:** `UploadTest` › "only mp4 and webm videos…" fails on this Windows machine (PHP `finfo` can't open the temp upload). Unrelated to these phases.
- **Production:** each phase's migrations run on deploy (`php artisan migrate`); `dist/` and `admin/dist/` must be rebuilt and committed before a deploy. Not done.
- **Phase 2:** 11 products sit only in retired categories (Phone Accessories, Smart Watches) and await review; "Gaming Tables" needs its own category before it shows.
- **Phase 3:** if the owner saved a custom top menu, Buy Used appears only once switched on in Admin › Menu.
- **Phase 4:** the official Whish Money logo isn't in the project. Checkout shows it automatically once saved as `public/images/payments/whish-money.svg`; no stand-in logo is used. Whish has no merchant API here: payments are confirmed by hand on the order (Mark as paid). If the owner saved custom payment methods in Settings, Whish Money must be ticked there.
- **Phase 4:** Weekly Offers shows the owner's hand-picks (Admin › Homepage), else products in a running offer (Admin › Offers), else products on their own sale. "See all" opens New Offers, which now also lists every product on offer.
