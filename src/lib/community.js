/* Reviews, messages with the store and back-in-stock alerts, from the Laravel API.
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

/** "12|0" for the product itself, "12|40" for one of its variants. */
export const alertKey = (id, variant) => `${id}|${variant || 0}`;
/** What the buyer is still waiting for ({ key, id, variant, channel }); ones they were already told about drop out. */
const waiting = (rows) => rows.filter((a) => !a.notified_at).map((a) => ({ key: alertKey(a.product_id, a.variant_id), id: String(a.product_id), variant: a.variant_id ?? null, channel: a.channel || 'email' }));
export const alerts = {
  list: async () => waiting((await laravelApi.get('/account/stock-alerts')).data),
  add: async (id, variant = null) => waiting((await laravelApi.post('/account/stock-alerts', { product_id: Number(id), variant_id: variant ? Number(variant) : null })).data),
  /** Stops waiting for the product (every variant), or only for one variant of it. */
  remove: async (id, variant = null) => { await laravelApi.del(`/account/stock-alerts/${encodeURIComponent(id)}${variant ? `?variant_id=${encodeURIComponent(variant)}` : ''}`); return alerts.list(); },
  /** "Notify me when it's available" from the product page, signed in or not: { product_id, variant_id, channel, email|phone, consent }. */
  request: async (body) => (await laravelApi.post('/stock-alerts', body)).data,
  /** Withdraws a request with its private token. */
  cancel: async (token) => { await laravelApi.del(`/stock-alerts/${encodeURIComponent(token)}`); },
};
