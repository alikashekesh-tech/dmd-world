/* Recently viewed products, kept on this device only (a convenience, not account data). */
const KEY = 'dmd:recent';
const MAX = 12;

export function recentIds() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^\d{1,12}$/.test(x)) : []; } catch { return []; }
}
export function rememberView(id) {
  try { localStorage.setItem(KEY, JSON.stringify([String(id), ...recentIds().filter((x) => x !== String(id))].slice(0, MAX))); } catch { /* storage unavailable */ }
}
export function forgetViews() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
