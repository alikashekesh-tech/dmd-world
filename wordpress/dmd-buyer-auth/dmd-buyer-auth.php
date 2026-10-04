<?php
/**
 * Plugin Name: DMD Buyer Auth
 * Description: Lets the DMD World storefront server check buyer passwords and send password-reset emails, and applies the store's password rules on the WordPress site as well.
 * Version: 1.1.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: DMD World
 *
 * Setup (wp-config.php, above "That's all, stop editing!"):
 *   define( 'DMD_AUTH_SECRET', '...same 64-character value as DMD_AUTH_SECRET in server/.env...' );
 *   define( 'DMD_STOREFRONT_URL', 'https://your-storefront-address' ); // password-reset links must point here
 *
 * Endpoints (only callable by the storefront server, which sends the shared secret in X-DMD-Secret):
 *   POST /wp-json/dmd/v1/auth        { login, password }  -> { id, email } or 401
 *   POST /wp-json/dmd/v1/send-reset  { email, link }      -> { sent: bool }
 *   POST /wp-json/dmd/v1/notify-stock { customer_id, product_id, link } -> { sent: bool }  (back-in-stock email)
 * Only accounts with the "customer" role can sign in this way, so shop managers and administrators never
 * become storefront buyers.
 */

defined( 'ABSPATH' ) || exit;

/** Same rules as shared/passwordPolicy.js: 8+ characters, upper and lower case, a number, a special character. */
function dmd_password_problems( $password ) {
	$p       = (string) $password;
	$missing = array();
	if ( mb_strlen( $p ) < 8 ) {
		$missing[] = __( 'at least 8 characters', 'dmd-buyer-auth' );
	}
	if ( ! preg_match( '/\p{Lu}/u', $p ) ) {
		$missing[] = __( 'one uppercase letter', 'dmd-buyer-auth' );
	}
	if ( ! preg_match( '/\p{Ll}/u', $p ) ) {
		$missing[] = __( 'one lowercase letter', 'dmd-buyer-auth' );
	}
	if ( ! preg_match( '/\p{Nd}/u', $p ) ) {
		$missing[] = __( 'one number', 'dmd-buyer-auth' );
	}
	if ( ! preg_match( '/[^\p{L}\p{N}\s]/u', $p ) ) {
		$missing[] = __( 'one special character', 'dmd-buyer-auth' );
	}
	if ( mb_strlen( $p ) > 128 ) {
		$missing[] = __( 'at most 128 characters', 'dmd-buyer-auth' );
	}
	return $missing;
}

function dmd_password_message( $missing ) {
	/* translators: %s: list of missing password requirements */
	return sprintf( __( 'Your password needs %s.', 'dmd-buyer-auth' ), implode( ', ', $missing ) );
}

/** Only the storefront server knows the secret. Constant-time comparison; refuses until configured. */
function dmd_check_secret( WP_REST_Request $request ) {
	if ( ! defined( 'DMD_AUTH_SECRET' ) || strlen( (string) DMD_AUTH_SECRET ) < 32 ) {
		return new WP_Error( 'dmd_not_configured', 'DMD Buyer Auth is not configured.', array( 'status' => 503 ) );
	}
	$given = (string) $request->get_header( 'x-dmd-secret' );
	if ( '' === $given || ! hash_equals( (string) DMD_AUTH_SECRET, $given ) ) {
		return new WP_Error( 'dmd_forbidden', 'Forbidden.', array( 'status' => 403 ) );
	}
	return true;
}

function dmd_find_customer( $login ) {
	$login = trim( (string) $login );
	if ( '' === $login ) {
		return null;
	}
	$user = is_email( $login ) ? get_user_by( 'email', $login ) : get_user_by( 'login', $login );
	if ( ! $user || ! in_array( 'customer', (array) $user->roles, true ) ) {
		return null;
	}
	return $user;
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'dmd/v1',
			'/auth',
			array(
				'methods'             => 'POST',
				'permission_callback' => 'dmd_check_secret',
				'callback'            => function ( WP_REST_Request $request ) {
					$login    = strtolower( trim( (string) $request->get_param( 'login' ) ) );
					$password = (string) $request->get_param( 'password' );
					// Second line of defence behind the storefront server: 10 failures per login per 15 minutes.
					$key   = 'dmd_auth_fail_' . md5( $login );
					$fails = (int) get_transient( $key );
					if ( $fails >= 10 ) {
						return new WP_Error( 'dmd_locked', 'Too many attempts.', array( 'status' => 429 ) );
					}
					$user = dmd_find_customer( $login );
					// Always check one hash, so unknown accounts answer as slowly as wrong passwords.
					$hash = $user ? $user->user_pass : '$P$BdmdDummyHashForTimingOnly0000/'; // valid 34-character phpass format, so it is really computed
					$ok   = '' !== $password && strlen( $password ) <= 256 && wp_check_password( $password, $hash, $user ? $user->ID : '' );
					if ( ! $user || ! $ok ) {
						set_transient( $key, $fails + 1, 15 * MINUTE_IN_SECONDS );
						return new WP_Error( 'dmd_invalid', 'Invalid email or password.', array( 'status' => 401 ) );
					}
					delete_transient( $key );
					return array(
						'id'    => (int) $user->ID,
						'email' => $user->user_email,
					);
				},
			)
		);

		register_rest_route(
			'dmd/v1',
			'/send-reset',
			array(
				'methods'             => 'POST',
				'permission_callback' => 'dmd_check_secret',
				'callback'            => function ( WP_REST_Request $request ) {
					$base = defined( 'DMD_STOREFRONT_URL' ) ? untrailingslashit( (string) DMD_STOREFRONT_URL ) : '';
					$link = esc_url_raw( (string) $request->get_param( 'link' ) );
					if ( '' === $base || 0 !== strpos( $link, $base . '/' ) ) {
						return new WP_Error( 'dmd_bad_link', 'Reset link must point to the storefront.', array( 'status' => 400 ) );
					}
					$user = dmd_find_customer( sanitize_email( (string) $request->get_param( 'email' ) ) );
					if ( ! $user ) {
						return array( 'sent' => false );
					}
					// At most 3 reset emails per account per hour, whatever the caller does.
					$key  = 'dmd_reset_sent_' . $user->ID;
					$sent = (int) get_transient( $key );
					if ( $sent >= 3 ) {
						return array( 'sent' => false );
					}
					set_transient( $key, $sent + 1, HOUR_IN_SECONDS );
					$site    = wp_specialchars_decode( get_option( 'blogname' ), ENT_QUOTES );
					$name    = $user->first_name ? $user->first_name : $user->display_name;
					$subject = sprintf( '[%s] Reset your password', $site );
					$body    = sprintf(
						"Hi %1\$s,\n\nSomeone asked to reset the password for your %2\$s account (%3\$s).\n\nTo choose a new password, open this link within 1 hour:\n%4\$s\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.\n",
						$name,
						$site,
						$user->user_email,
						$link
					);
					return array( 'sent' => (bool) wp_mail( $user->user_email, $subject, $body ) );
				},
			)
		);

		register_rest_route(
			'dmd/v1',
			'/notify-stock',
			array(
				'methods'             => 'POST',
				'permission_callback' => 'dmd_check_secret',
				'callback'            => function ( WP_REST_Request $request ) {
					// The email is built here from the store's own data: the caller only names a customer and a product,
					// so even a leaked secret can't send arbitrary text or mail anyone who isn't a customer.
					$base = defined( 'DMD_STOREFRONT_URL' ) ? untrailingslashit( (string) DMD_STOREFRONT_URL ) : '';
					$link = esc_url_raw( (string) $request->get_param( 'link' ) );
					if ( '' === $base || 0 !== strpos( $link, $base . '/' ) ) {
						return new WP_Error( 'dmd_bad_link', 'Links must point to the storefront.', array( 'status' => 400 ) );
					}
					$user    = get_user_by( 'id', absint( $request->get_param( 'customer_id' ) ) );
					$product = function_exists( 'wc_get_product' ) ? wc_get_product( absint( $request->get_param( 'product_id' ) ) ) : null;
					if ( ! $user || ! in_array( 'customer', (array) $user->roles, true ) || ! $product || 'publish' !== $product->get_status() ) {
						return array( 'sent' => false );
					}
					// At most 10 back-in-stock emails per account per day.
					$key  = 'dmd_stock_sent_' . $user->ID;
					$sent = (int) get_transient( $key );
					if ( $sent >= 10 ) {
						return array( 'sent' => false );
					}
					set_transient( $key, $sent + 1, DAY_IN_SECONDS );
					$site    = wp_specialchars_decode( get_option( 'blogname' ), ENT_QUOTES );
					$name    = $user->first_name ? $user->first_name : $user->display_name;
					$title   = wp_strip_all_tags( $product->get_name() );
					$subject = sprintf( '[%1$s] %2$s is back in stock', $site, $title );
					$body    = sprintf(
						"Hi %1\$s,\n\nGood news: %2\$s is back in stock at %3\$s.\n%4\$s\n\nStock can go quickly, so order soon if you still want it.\nYou asked us to email you about this product. We won't email you about it again.\n",
						$name,
						$title,
						$site,
						$link
					);
					return array( 'sent' => (bool) wp_mail( $user->user_email, $subject, $body ) );
				},
			)
		);
	}
);

/* ── The same password rules on the WordPress / WooCommerce site itself ── */

// Registration on My Account or at checkout.
add_filter(
	'woocommerce_registration_errors',
	function ( $errors ) {
		$password = '';
		if ( isset( $_POST['password'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- WooCommerce verifies the nonce before this filter.
			$password = (string) wp_unslash( $_POST['password'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		} elseif ( isset( $_POST['account_password'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			$password = (string) wp_unslash( $_POST['account_password'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		}
		if ( '' !== $password ) {
			$missing = dmd_password_problems( $password );
			if ( $missing ) {
				$errors->add( 'dmd_weak_password', dmd_password_message( $missing ) );
			}
		}
		return $errors;
	},
	10,
	1
);

// My Account -> Account details -> password change.
add_action(
	'woocommerce_save_account_details_errors',
	function ( $errors ) {
		$password = isset( $_POST['password_1'] ) ? (string) wp_unslash( $_POST['password_1'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		if ( '' !== $password ) {
			$missing = dmd_password_problems( $password );
			if ( $missing ) {
				$errors->add( 'dmd_weak_password', dmd_password_message( $missing ) );
			}
		}
	},
	10,
	1
);

// Lost-password reset (WooCommerce form and wp-login.php).
add_action(
	'validate_password_reset',
	function ( $errors ) {
		$password = '';
		if ( isset( $_POST['password_1'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			$password = (string) wp_unslash( $_POST['password_1'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		} elseif ( isset( $_POST['pass1'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			$password = (string) wp_unslash( $_POST['pass1'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		}
		if ( '' !== $password ) {
			$missing = dmd_password_problems( $password );
			if ( $missing ) {
				$errors->add( 'dmd_weak_password', dmd_password_message( $missing ) );
			}
		}
	},
	10,
	1
);

// Profile screen in wp-admin.
add_action(
	'user_profile_update_errors',
	function ( $errors, $update, $user ) {
		if ( ! empty( $user->user_pass ) && isset( $_POST['pass1'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- core checks the nonce.
			$missing = dmd_password_problems( (string) wp_unslash( $_POST['pass1'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			if ( $missing ) {
				$errors->add( 'dmd_weak_password', dmd_password_message( $missing ) );
			}
		}
	},
	10,
	3
);
