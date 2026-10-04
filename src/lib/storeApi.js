/* The storefront's connection to the DMD World server (/api): buyer accounts, orders, wishlist, reviews, catalog.
   Sessions are an HttpOnly cookie the browser holds; nothing secret is stored in this code or in localStorage.
   Always same-origin "/api": in development Vite proxies it to the server (vite.config.js), in production the
   server (or the reverse proxy in front of it) answers it. */
const BASE = import.meta.env.VITE_STORE_API || '/api';
const TIMEOUT = 20000;

export class StoreApiError extends Error {
  constructor(message, status, code, fields) { super(message); this.status = status; this.code = code; this.fields = fields || null; }
}
const OFFLINE = 'We can’t reach the store right now. Check your connection and try again.';

async function call(method, path, body, { timeout = TIMEOUT, headers } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new StoreApiError(e?.name === 'TimeoutError' ? 'The store is taking too long to answer. Please try again.' : OFFLINE, 0, 'offline');
  }
  // Anything that isn't the API's JSON (a proxy error page, an HTML fallback) means the API wasn't reached.
  if (!/application\/json/i.test(res.headers.get('content-type') || '')) throw new StoreApiError(OFFLINE, res.status || 0, 'offline');
  const data = await res.json().catch(() => null);
  if (data === null) throw new StoreApiError(OFFLINE, res.status, 'offline');
  if (!res.ok) throw new StoreApiError(data.error || `Something went wrong (${res.status}).`, res.status, data.code, data.fields);
  return data;
}

export const storeApi = {
  get: (path, opts) => call('GET', path, null, opts),
  post: (path, body, opts) => call('POST', path, body || {}, opts),
  put: (path, body, opts) => call('PUT', path, body || {}, opts),
  del: (path, opts) => call('DELETE', path, null, opts),
};

/* Guests can reopen their own order confirmations with the private key WooCommerce gave them. */
const GUEST_KEY = 'dmd:guest-orders';
const KEEP_DAYS = 30; // a shared device forgets a guest's order link after a month
export const guestOrders = {
  all() {
    try {
      const list = JSON.parse(localStorage.getItem(GUEST_KEY)) || [];
      return Array.isArray(list) ? list.filter((o) => o && o.id && typeof o.key === 'string' && (!o.at || Date.now() - o.at < KEEP_DAYS * 864e5)) : [];
    } catch { return []; }
  },
  add(id, key) { try { localStorage.setItem(GUEST_KEY, JSON.stringify([{ id, key, at: Date.now() }, ...guestOrders.all().filter((o) => o.id !== id)].slice(0, 10))); } catch { /* storage unavailable */ } },
  keyFor(id) { return guestOrders.all().find((o) => String(o.id) === String(id))?.key || null; },
};

/* What WooCommerce calls each order status, in words a buyer understands. `step` places it on the order timeline. */
export const ORDER_STATUS = {
  pending: { label: 'Awaiting confirmation', tone: 'wait', hint: 'DMD will call or message you to confirm.', step: 1 },
  'on-hold': { label: 'On hold', tone: 'wait', hint: 'Waiting on payment or stock. DMD will be in touch.', step: 1 },
  processing: { label: 'Confirmed', tone: 'go', hint: 'Your order is being prepared.', step: 2 },
  completed: { label: 'Completed', tone: 'done', hint: 'Delivered or collected.', step: 3 },
  cancelled: { label: 'Cancelled', tone: 'stop', hint: '', step: -1 },
  refunded: { label: 'Refunded', tone: 'stop', hint: '', step: -1 },
  failed: { label: 'Failed', tone: 'stop', hint: 'Contact DMD if this looks wrong.', step: -1 },
};
