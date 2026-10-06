/* Reviews, messages with the store and back-in-stock alerts for the Laravel backend (VITE_BACKEND=laravel).
   Everything a buyer owns is reached through the session cookie; no buyer id is ever sent. Laravel's answers are
   turned into the shapes the storefront components already use. Review and message text is plain text. */
import { laravelApi } from './laravelApi.js';

const REVIEW_STATUS = { pending: 'pending', approved: 'published' }; // rejected and spam: "Not published"

/** Laravel's review → the storefront's review. */
export const reviewFromApi = (r) => ({
  id: r.id, productId: r.product_id ?? null, product: r.product?.name || '', name: r.author, rating: r.rating,
  title: r.title || null, text: r.body, date: r.created_at, verified: !!r.verified_purchase,
  status: r.status ? REVIEW_STATUS[r.status] || 'hidden' : undefined,
});

/** Laravel's conversation → { id, orderId, subject, unread, last, thread: [{ id, from: 'you'|'store'|'system', text, at }] }. */
export const conversationFromApi = (c) => ({
  id: c.id, orderId: c.order?.id ?? null, number: c.order?.number ?? null, status: c.order?.status ?? null, subject: c.subject,
  unread: !!c.unread, last: c.last_message_at, preview: c.last_message?.excerpt || '',
  thread: (c.messages || []).map((m) => ({ id: m.id, from: m.from, text: m.body, at: m.created_at })),
});

export const reviews = {
  /** Approved reviews and the summary ({ average, count, verified, breakdown }), newest first. */
  async forProduct(productId, page = 1) {
    const r = await laravelApi.get(`/products/${encodeURIComponent(productId)}/reviews?page=${page}&per_page=20`);
    return { ...r.meta.summary, items: r.data.map(reviewFromApi), page: r.meta.current_page, more: r.meta.current_page < r.meta.last_page };
  },
  mine: async (productId) => (await laravelApi.get(`/account/reviews${productId ? `?product=${encodeURIComponent(productId)}` : ''}`)).data.map(reviewFromApi),
  create: async (productId, { rating, title, text }) => reviewFromApi((await laravelApi.post('/account/reviews', { product_id: Number(productId), rating, title, body: text })).data),
};

export const messages = {
  list: async () => {
    const r = await laravelApi.get('/account/conversations?per_page=50');
    return { items: r.data.map(conversationFromApi), unread: r.meta.unread };
  },
  /** Opening a conversation marks the store's replies as read. */
  get: async (id) => conversationFromApi((await laravelApi.get(`/account/conversations/${encodeURIComponent(id)}`)).data),
  /** The first message about an order (or continues its conversation). */
  start: async (orderId, text) => conversationFromApi((await laravelApi.post('/account/conversations', { order_id: Number(orderId), body: text })).data),
  reply: async (id, text) => {
    const { data: m } = await laravelApi.post(`/account/conversations/${encodeURIComponent(id)}/messages`, { body: text });
    return { id: m.id, from: m.from, text: m.body, at: m.created_at };
  },
  unread: async () => (await laravelApi.get('/account/conversations/unread')).unread,
};

/** Products the buyer is still waiting for (ones already emailed about drop out, as the email has gone). */
const waiting = (rows) => rows.filter((a) => !a.notified_at).map((a) => String(a.product_id));
export const alerts = {
  list: async () => waiting((await laravelApi.get('/account/stock-alerts')).data),
  add: async (id) => waiting((await laravelApi.post('/account/stock-alerts', { product_id: Number(id) })).data),
  remove: async (id) => { await laravelApi.del(`/account/stock-alerts/${encodeURIComponent(id)}`); return alerts.list(); },
};
