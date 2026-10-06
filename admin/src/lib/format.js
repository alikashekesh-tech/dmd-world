const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = (v, whole = false) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : (whole ? usd0 : usd).format(Number(v)));
export const num = (v) => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
export const pct = (a, b) => (!b ? null : ((a - b) / b) * 100);

/* The API sends ISO 8601 times with their offset ("2026-10-03T14:22:10+00:00"); the browser shows them in local time. */
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
/** <input type="datetime-local"> value (the owner's local time) from an API time, and back to an ISO time. */
export const toInputDate = (s) => {
  const d = toDate(s); if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromInputDate = (s) => (s ? new Date(s).toISOString() : null);

/** Only in-app routes (#/...) and http(s) addresses become links; anything else (javascript:, data:) is dropped. */
export const safeHref = (u) => { const s = String(u || '').trim(); return /^#\//.test(s) || /^https?:\/\//i.test(s) ? s : null; };

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

export const STATUS = {
  pending: { label: 'Pending', tone: 'amber', hint: 'Waiting for payment or confirmation' },
  processing: { label: 'Processing', tone: 'blue', hint: 'Paid or confirmed, being prepared' },
  on_hold: { label: 'On hold', tone: 'violet', hint: 'Waiting on something before processing' },
  completed: { label: 'Completed', tone: 'green', hint: 'Delivered' },
  cancelled: { label: 'Cancelled', tone: 'coral', hint: 'Cancelled by you or the buyer' },
  refunded: { label: 'Refunded', tone: 'muted', hint: '' },
  failed: { label: 'Failed', tone: 'coral', hint: 'Payment failed' },
};
export const OWNER_STATUSES = ['pending', 'processing', 'on_hold', 'completed', 'cancelled'];
/** Where an order can go next. A copy for the menus only: the server checks every change (Order::TRANSITIONS). */
export const NEXT_STATUS = {
  pending: ['processing', 'on_hold', 'completed', 'cancelled'], on_hold: ['processing', 'completed', 'cancelled'],
  processing: ['on_hold', 'completed', 'cancelled'], completed: ['refunded'], cancelled: ['pending', 'processing'], refunded: [], failed: ['pending', 'cancelled'],
};
