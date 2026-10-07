# DMD World · Command (the owner's back office)

A React app served at `/admin/`, talking only to the Laravel API at `/api/v1/admin` (same origin). There is exactly one owner account; buyers can never reach any admin route (separate `admin` guard and session).

```
admin/src/App.jsx        session (GET /auth/me), sign-in, routes
admin/src/lib/api.js     the API client: Sanctum cookie session, CSRF (X-XSRF-TOKEN), Laravel's error format
admin/src/lib/*.js       small adapters from Laravel's answers to what the screens draw (catalog, dashboard)
admin/src/pages/         dashboard, products, categories, brands, inventory, offers & coupons, orders, buyers,
                         messages, reviews, homepage, notifications, trash, settings
admin/src/ui/kit.jsx     the shared components (no other UI library)
```

## Run

From the project root, with the API running (`npm run api:serve`):

```bash
npm run dev
```

Open http://127.0.0.1:5173/admin/. The owner account is created once on the server:

```bash
php artisan dmd:owner
```

(inside `backend/`; `php artisan dmd:owner --reset` changes its password). On a local machine, `php artisan dmd:owner --local-test` creates a throwaway owner and writes its login to `backend/storage/app/private/local-owner-login.txt` (never committed).

## Build

```bash
npm run build:admin
```

Writes `admin/dist/`, served at `/admin/` (see `deploy/Caddyfile`).

## How it behaves

- **Every number is real:** the dashboard, badges and notifications are computed from MySQL on each request (see `backend/app/Services/Analytics.php`). Nothing is estimated; an empty store shows zeros.
- **Nothing is deleted by accident:** products, categories, brands and coupons are archived first and can be restored from the Trash; deleting for good is refused while something still uses the record. Orders are never deleted (cancel instead): they are the store's history.
- **Prices:** offers are worked into prices as they run and never rewrite a product's own prices.
- **Stock:** every change (an edit, a stocktake, an order, a cancellation) is a line in the product's stock history.
