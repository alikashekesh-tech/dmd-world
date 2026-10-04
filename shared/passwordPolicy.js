/* One password policy for every account (owner and buyers), used by the server to enforce it and by the
   UIs to show it live. Plain ESM with no dependencies, so Node and Vite can both import it. */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (p) => [...p].length >= PASSWORD_MIN },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p) => /\p{Lu}/u.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p) => /\p{Ll}/u.test(p) },
  { id: 'number', label: 'One number (0–9)', test: (p) => /\p{Nd}/u.test(p) },
  { id: 'special', label: 'One special character (! @ # …)', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** Each rule with whether the password meets it, for a live checklist. */
export const checkPassword = (password = '') => PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(String(password)) }));

/** null when the password is acceptable, otherwise a sentence saying what is missing. */
export function passwordError(password) {
  const p = String(password ?? '');
  if ([...p].length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const missing = PASSWORD_RULES.filter((r) => !r.test(p));
  if (!missing.length) return null;
  return `The password needs: ${missing.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1)).join(', ')}.`;
}
