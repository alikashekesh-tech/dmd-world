# DMD Buyer Auth (WordPress plugin)

Lets the DMD World storefront use the store's real customer accounts. Install it on **staging first**.

What it does:

- **`POST /wp-json/dmd/v1/auth`:** checks a buyer's email and password against WordPress. Only accounts with the `customer` role can sign in, so shop managers and admins are never buyers.
- **`POST /wp-json/dmd/v1/send-reset`:** emails a buyer their password-reset link. The link must point at your storefront.
- **`POST /wp-json/dmd/v1/notify-stock`** (version 1.1): emails a buyer that a product they asked about is back in stock. The plugin writes the email itself from the store's own data (the server only names the customer and the product), only to `customer` accounts, at most 10 per account per day.
- **Password rules on the WordPress site too:** the same rules apply to My Account registration and checkout sign-up, the account-details password change, lost-password resets and wp-admin profiles.
- **Server-only access:** every endpoint answers only requests that carry the shared secret, which only the DMD World server has.

**Updating from 1.0:** upload the new zip (Plugins → Add New → Upload Plugin → Replace current with uploaded). Until 1.1 is installed, back-in-stock requests are kept and the emails go out once it is.

## Install

1. Zip the `dmd-buyer-auth` folder and upload it: **Plugins → Add New → Upload Plugin**. Then activate it.
2. Generate the shared secret on the server:
   ```bash
   npm --prefix server run setup -- --buyer-secret
   ```
3. Add two lines to `wp-config.php`, above *"That's all, stop editing!"*:
   ```php
   define( 'DMD_AUTH_SECRET', 'the value printed in step 2' );
   define( 'DMD_STOREFRONT_URL', 'https://your-storefront-address' );
   ```
4. In `server/.env`, set `STOREFRONT_URL` to the same address, then restart the server.
5. Check that WordPress sends email (WooCommerce → Settings → Emails, or an SMTP plugin). Reset links go out with `wp_mail`.

Until the secret is set on both sides, storefront sign-in and sign-up stay off. Guest checkout and review display still work.

## Notes

- **Passwords:** these are checked with WordPress's own `wp_check_password`, so existing customers keep their current passwords. The plugin never stores or logs them.
- **Brute force:** the storefront server limits guessing (6 failures per account and 30 per connection, each over 15 minutes). You can also keep any WordPress security plugin you use.
- **Removing it** is safe: storefront accounts switch off; nothing in WooCommerce changes.
