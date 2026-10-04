const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = (v, whole = false) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : (whole ? usd0 : usd).format(Number(v)));
export const num = (v) => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
export const pct = (a, b) => (!b ? null : ((a - b) / b) * 100);

/* WooCommerce sends local times without a zone ("2026-10-03T14:22:10"); the browser reads those as local. */
export const toDate = (s) => (s ? new Date(s) : null);
export function ago(s) {
  const d = toDate(s); if (!d) return '—';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24); if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
/** "in 3 d", "in 5 h", "today" for a future date; falls back to ago() for past ones. */
export function until(s) {
  const d = toDate(s); if (!d) return '—';
  const m = Math.round((d.getTime() - Date.now()) / 60000);
  if (m <= 0) return ago(s);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `in ${h} h`;
  const days = Math.round(h / 24); if (days < 14) return `in ${days} d`;
  return `on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
export const day = (s) => { const d = toDate(s); return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
export const dateTime = (s) => { const d = toDate(s); return d ? `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—'; };
/** <input type="datetime-local"> value from a WooCommerce local date, and back. */
export const toInputDate = (s) => (s ? String(s).slice(0, 16) : '');
export const fromInputDate = (s) => (s ? `${s}:00` : null);

/** Only in-app routes (#/...) and http(s) addresses become links; anything else (javascript:, data:) is dropped. */
export const safeHref = (u) => { const s = String(u || '').trim(); return /^#\//.test(s) || /^https?:\/\//i.test(s) ? s : null; };

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

export const STATUS = {
  pending: { label: 'Pending', tone: 'amber', hint: 'Waiting for payment or confirmation' },
  processing: { label: 'Processing', tone: 'blue', hint: 'Paid or confirmed, being prepared' },
  'on-hold': { label: 'On hold', tone: 'violet', hint: 'Waiting on something before processing' },
  completed: { label: 'Completed', tone: 'green', hint: 'Delivered' },
  cancelled: { label: 'Cancelled', tone: 'coral', hint: 'Cancelled by you or the buyer' },
  refunded: { label: 'Refunded', tone: 'muted', hint: '' },
  failed: { label: 'Failed', tone: 'coral', hint: 'Payment failed' },
  trash: { label: 'Trash', tone: 'muted', hint: '' },
};
export const OWNER_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled'];
