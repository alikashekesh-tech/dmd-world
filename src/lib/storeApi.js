/* Shared pieces of the storefront's API client (lib/laravelApi.js): the error every call raises, the private keys a
   guest's browser keeps to reopen its own orders, and the order statuses in words a buyer understands. */
export class StoreApiError extends Error {
  constructor(message, status, code, fields) { super(message); this.status = status; this.code = code; this.fields = fields || null; }
}

/* Guests can reopen their own order confirmations with the private token the store gave them at checkout. */
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

/* Each order status in words a buyer understands. `step` places it on the order timeline. */
export const ORDER_STATUS = {
  pending: { label: 'Awaiting confirmation', tone: 'wait', hint: 'DMD will call or message you to confirm.', step: 1 },
  'on-hold': { label: 'On hold', tone: 'wait', hint: 'Waiting on payment or stock. DMD will be in touch.', step: 1 },
  processing: { label: 'Confirmed', tone: 'go', hint: 'Your order is being prepared.', step: 2 },
  completed: { label: 'Completed', tone: 'done', hint: 'Delivered or collected.', step: 3 },
  cancelled: { label: 'Cancelled', tone: 'stop', hint: '', step: -1 },
  refunded: { label: 'Refunded', tone: 'stop', hint: '', step: -1 },
  failed: { label: 'Failed', tone: 'stop', hint: 'Contact DMD if this looks wrong.', step: -1 },
};
