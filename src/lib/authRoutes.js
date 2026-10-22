/* The buyer's sign-in forms each have their own address, so a link always opens the form it names, whatever form is
   showing now (the mobile menu's "Sign in" pressed on Create account, for example). /account is the signed-in area;
   signed out, it sends the buyer to SIGN_IN and back to where they were going afterwards. */
export const SIGN_IN = '/account/sign-in';
export const REGISTER = '/account/register';
export const FORGOT = '/account/forgot-password';

/** A page of this site to return to after signing in: plain paths only (no "//host", backslashes or spaces). */
export const safeNext = (next) => (typeof next === 'string' && next.length < 300 && /^\/(?![/\\])[^\\\s]*$/.test(next) ? next : null);

/** An auth form's address, carrying where to go once signed in. */
export const authUrl = (path, next) => {
  const n = safeNext(next);
  return n ? `${path}?next=${encodeURIComponent(n)}` : path;
};
