/* The quantity a buyer types: whole numbers from 1 up to what's available. The cart and the server check again. */

export const MAX_DIGITS = 4;

/** What the box keeps while typing: digits only, at most four (no minus sign, decimal point or letters). */
export const qtyDraft = (text) => String(text ?? '').replace(/\D+/g, '').slice(0, MAX_DIGITS);

/** A finished entry as a quantity, or null while it isn't a whole number of 1 or more within `max`. */
export function liveQty(draft, max = Infinity) {
  if (!/^\d+$/.test(draft)) return null;
  const n = Number(draft);
  return n >= 1 && n <= max ? n : null;
}

/**
 * The quantity once the buyer leaves the box: empty goes back to the last one, 0 becomes 1, more than `max` becomes
 * `max`. `limited` says the buyer asked for more than is available.
 * @returns {{ value: number, limited: boolean }}
 */
export function settleQty(draft, { max = Infinity, current = 1 } = {}) {
  const top = Math.max(1, Number.isFinite(max) ? Math.floor(max) : Infinity);
  const clean = qtyDraft(draft);
  if (clean === '') return { value: Math.min(Math.max(1, current), top), limited: false };
  const n = Number(clean);
  if (n < 1) return { value: 1, limited: false };
  if (n > top) return { value: top, limited: true };
  return { value: n, limited: false };
}
