// DMD World back office server. Serves the owner's /admin API (and the built admin UI) and is the only place the
// WooCommerce API keys live. Configure in server/.env (see .env.example).
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnv, setEnvValue } from './lib/env.mjs';
import { createWoo, WooError } from './lib/woo.mjs';
import { createSessions, createDeviceTrust, verifyPassword, hashPassword, needsRehash, loginAllowed, loginFailed, loginSucceeded } from './lib/auth.mjs';
import { securityHeaders, clientIp, idParam, limiter, plainText, httpUrl } from './lib/security.mjs';
import { createState } from './lib/state.mjs';
import { createIndexes, slimProduct, stockLevel } from './lib/indexes.mjs';
import { windowFor, summarise, classifier, leaderboards, REVENUE } from './lib/analytics.mjs';
import { createRouter, HttpError, readBody, parseCookies, serveStatic, serveSpa } from './lib/http.mjs';
import { passwordError } from '../shared/passwordPolicy.js';
import { createBuyerApi, BUYER_TAG } from './buyer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// DMD_ENV_FILE / DMD_DATA_DIR let tests (or a second instance) run with their own settings and data.
const ENV_FILE = process.env.DMD_ENV_FILE || join(HERE, '.env');
loadEnv(ENV_FILE);
const DATA_DIR = process.env.DMD_DATA_DIR || join(HERE, 'data');
const E = process.env;
const PORT = Number(E.PORT || 8787);
const ENV = (E.WOO_ENV || 'staging').toLowerCase(); // emulator | staging | live
const READ_ONLY = E.WOO_READ_ONLY === 'true';
const STOREFRONT_URL = (E.STOREFRONT_URL || 'http://localhost:5173').replace(/\/$/, '');
const ORIGINS = [...new Set([...(E.ADMIN_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()), new URL(STOREFRONT_URL).origin])];
const ADMIN_DIST = join(HERE, '..', 'admin', 'dist');
// Production can serve the built storefront too (one process behind HTTPS): SERVE_STOREFRONT=true after `npm run build`.
const STOREFRONT_DIST = E.STOREFRONT_DIST || join(HERE, '..', 'dist');
const SERVE_STOREFRONT = E.SERVE_STOREFRONT === 'true';
const LOG_REQUESTS = E.LOG_REQUESTS === 'true';
const STARTED = Date.now();
const HOST = E.HOST || '127.0.0.1'; // only this machine by default; a reverse proxy in front handles the public side
const TRUST_PROXY = E.TRUST_PROXY === 'true';
const HTTPS = E.COOKIE_SECURE === 'true';
const missing = ['WOO_URL', 'WOO_KEY', 'WOO_SECRET', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET'].filter((k) => !E[k]);
if (E.SESSION_SECRET && E.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (needs 32+ random characters)');
if (E.DMD_AUTH_SECRET && E.DMD_AUTH_SECRET.length < 32) console.warn('DMD_AUTH_SECRET is shorter than 32 characters, so buyer accounts stay off.');
const configured = missing.length === 0;

const woo = configured ? createWoo({ url: E.WOO_URL, key: E.WOO_KEY, secret: E.WOO_SECRET, queryAuth: E.WOO_QUERY_AUTH === 'true', readOnly: READ_ONLY }) : null;
const idx = configured ? createIndexes(woo) : null;
const wpMedia = E.WP_USER && E.WP_APP_PASSWORD ? { user: E.WP_USER, pass: E.WP_APP_PASSWORD } : null;

// Brand categories default to the storefront's own brand menu (read-only import of its data file).
const { BRAND_GROUPS, DMD_GROUPS, NEW_OFFERS, catUrl } = await import('../src/data/dmdMenu.js');
const state = createState(join(DATA_DIR, `state-${ENV}.json`), { brandCategoryIds: BRAND_GROUPS.map((g) => g.ids[0]).filter(Boolean), messagesBaseline: new Date(Date.now() - 3 * 864e5).toISOString() });
// Buyer notes from before the admin existed are treated as read, so the inbox starts with what's actually new.
// Owner sessions: signed with the session secret AND the current password hash (a password change signs out
// every device); logged-out tokens are remembered until they would have expired.
const sessions = configured ? createSessions(() => `${E.SESSION_SECRET}:${E.OWNER_PASSWORD_HASH}`, Math.min(24, Number(E.SESSION_HOURS || 12)), {
  isRevoked: (nonce) => !!state.get().revokedSessions?.[nonce],
  revoke: (nonce, exp) => state.update((s) => { const t = Date.now(); s.revokedSessions = Object.fromEntries(Object.entries(s.revokedSessions || {}).filter(([, e]) => e > t)); s.revokedSessions[nonce] = exp; }),
}) : null;
const deviceTrust = configured ? createDeviceTrust(() => E.SESSION_SECRET) : null;
// Remembers a device the owner has signed in on (see createDeviceTrust); only ever sent to the login route.
const deviceCookie = (token) => `dmd_device=${token}; HttpOnly; SameSite=Strict; Path=/admin/api/login; Max-Age=${deviceTrust.maxAge}${HTTPS ? '; Secure' : ''}`;
const ownerCookie = (token, maxAge = sessions.maxAge) => [
  `dmd_admin=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${maxAge}${HTTPS ? '; Secure' : ''}`,
  'dmd_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0', // clears cookies from older versions that used Path=/
];
const isUnread = (o) => {
  const st = state.get();
  const read = st.messageReads[o.id];
  const fromBuyer = st.buyerMessages?.[o.id];
  if (fromBuyer && (!read || fromBuyer.at > read)) return true; // a buyer replied from their account
  return !!o.customer_note && !read && new Date(o.date_created).getTime() > new Date(st.messagesBaseline || 0).getTime();
};
const ownerReplied = (id) => state.update((s) => { const at = new Date().toISOString(); s.messageReads[id] = at; (s.ownerReplies ||= {})[id] = at; });
// Buyer accounts (storefront) live under /api with their own sessions; see buyer.mjs.
const buyer = configured ? createBuyerApi({ woo, idx, state, file: join(DATA_DIR, `buyers-${ENV}.json`), wooUrl: E.WOO_URL, authSecret: E.DMD_AUTH_SECRET || '', storefrontUrl: STOREFRONT_URL, cookieSecure: E.COOKIE_SECURE === 'true', log: (m) => console.warn(m) }) : null;

const router = createRouter();
const STATUS_LABEL = { pending: 'Pending', processing: 'Processing', 'on-hold': 'On hold', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed', trash: 'Trash', 'checkout-draft': 'Draft' };
const OWNER_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled'];
const n = (v) => (v === '' || v == null ? null : Number(v));
const money = (v) => (Math.round(Number(v) * 100) / 100).toFixed(2);
const page = (list, q, per = 25) => {
  const p = Math.max(1, Number(q.get('page') || 1));
  const size = Math.min(100, Math.max(1, Number(q.get('per') || per)));
  return { items: list.slice((p - 1) * size, p * size), total: list.length, page: p, pages: Math.max(1, Math.ceil(list.length / size)) };
};
const orderName = (o) => `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim() || o.billing?.email || 'Guest';

/* ── session ─────────────────────────────────────────────────────────── */
router.get('/session', async ({ authed }) => {
  const ok = configured && authed;
  // Before sign-in only what the login screen needs: never the store address or capabilities.
  return {
    configured, missing: configured ? [] : missing, authed: ok,
    store: configured ? { env: ENV, readOnly: READ_ONLY, name: E.STORE_NAME || 'DMD World', ...(ok ? { url: E.WOO_URL } : {}) } : null,
    capabilities: ok ? { media: !!wpMedia, wpAdmin: ENV !== 'emulator' ? `${E.WOO_URL.replace(/\/$/, '')}/wp-admin/` : null } : { media: false, wpAdmin: null },
  };
}, { public: true });

router.post('/login', async ({ body, ip, res, req }) => {
  if (!configured) throw new HttpError(503, 'The admin server is not configured yet.');
  if (!loginAllowed(ip, deviceTrust.valid(parseCookies(req.headers.cookie).dmd_device))) throw new HttpError(429, 'Too many attempts. Try again in 10 minutes.');
  if (typeof body.password !== 'string' || !body.password || body.password.length > 256) { loginFailed(ip); throw new HttpError(401, 'That password is not right.'); }
  if (!verifyPassword(body.password, E.OWNER_PASSWORD_HASH)) { loginFailed(ip); throw new HttpError(401, 'That password is not right.'); }
  loginSucceeded(ip);
  if (needsRehash(E.OWNER_PASSWORD_HASH)) { const h = hashPassword(body.password); setEnvValue(ENV_FILE, 'OWNER_PASSWORD_HASH', h); E.OWNER_PASSWORD_HASH = h; } // upgrade to stronger hashing
  // The owner's session cookie only travels to /admin, never to the storefront or any buyer route.
  res.setHeader('Set-Cookie', [...ownerCookie(sessions.issue()), deviceCookie(deviceTrust.issue())]);
  return { ok: true };
}, { public: true });

router.post('/logout', async ({ req, res }) => {
  sessions?.end(parseCookies(req.headers.cookie).dmd_admin); // the token stops working everywhere, not just in this browser
  res.setHeader('Set-Cookie', ownerCookie('', 0));
  return { ok: true };
}, { public: true });

/* ── dashboard ───────────────────────────────────────────────────────── */
const dashCache = new Map();
router.get('/dashboard', async ({ q }) => {
  const range = q.get('range') || '7d';
  const hit = dashCache.get(range);
  if (hit && Date.now() - hit.at < 15e3 && q.get('fresh') !== '1') return hit.data;
  await Promise.all([idx.syncProducts(), idx.syncOrders()]);
  const [cats, th, statusTotals, held, customersHead, sales, recentReviews, recentCustomers, coupons] = await Promise.all([
    idx.categories(), idx.stockThresholds(),
    woo.get('/reports/orders/totals').then((r) => r.data),
    woo.get('/products/reviews', { status: 'hold', per_page: 1 }),
    woo.get('/customers', { per_page: 1, role: 'customer' }),
    woo.get('/reports/sales', { date_min: '2000-01-01' }).then((r) => r.data?.[0] || null).catch(() => null),
    woo.get('/products/reviews', { status: 'all', per_page: 6 }).then((r) => r.data),
    woo.get('/customers', { orderby: 'registered_date', order: 'desc', per_page: 6, role: 'customer' }).then((r) => r.data),
    woo.all('/coupons', {}, 3),
  ]);
  const orders = idx.orders();
  const products = idx.products().filter((p) => p.status !== 'trash');
  const w = windowFor(range);
  const s = summarise(orders, w);
  const classify = classifier(cats, state.get().brandCategoryIds);
  const boards = leaderboards(s.current.filter((o) => REVENUE.has(o.status)), (id) => idx.product(id), classify);

  // Daily target: the owner's, or 10% above the last 30 days' daily average.
  const last30 = summarise(orders, windowFor('30d'));
  const autoTarget = Math.max(50, Math.round((last30.revenue / 30) * 1.1 / 50) * 50);
  const today = range === 'today' ? s : summarise(orders, windowFor('today'));

  const levels = products.map((p) => ({ p, level: stockLevel(p, th) }));
  const low = levels.filter((x) => x.level === 'low').map((x) => x.p).sort((a, b) => a.stock_quantity - b.stock_quantity);
  const out = levels.filter((x) => x.level === 'out' && x.p.status === 'publish').map((x) => x.p);
  const soon = Date.now() + 3 * 864e5;
  const onSale = products.filter((p) => p.on_sale && p.status === 'publish');
  const salesEnding = products.filter((p) => p.date_on_sale_to && new Date(p.date_on_sale_to).getTime() < soon && new Date(p.date_on_sale_to).getTime() > Date.now());
  const liveCoupons = coupons.filter((c) => c.status === 'publish' && (!c.date_expires || new Date(c.date_expires).getTime() > Date.now()));
  const couponsEnding = liveCoupons.filter((c) => c.date_expires && new Date(c.date_expires).getTime() < soon);
  const totals = Object.fromEntries(statusTotals.map((x) => [x.slug, x.total]));
  const pendingOrders = orders.filter((o) => o.status === 'pending').sort((a, b) => a.date_created.localeCompare(b.date_created));
  const unread = orders.filter((o) => o.status !== 'trash' && isUnread(o)).length;

  const spend = new Map();
  for (const o of orders) if (REVENUE.has(o.status) && o.customer_id) { const e = spend.get(o.customer_id) || { orders: 0, total: 0 }; e.orders++; e.total += Number(o.total); spend.set(o.customer_id, e); }

  const activity = [
    ...state.get().activity.slice(0, 30).map((a) => ({ ...a, source: 'admin' })),
    ...orders.filter((o) => Date.now() - new Date(o.date_created).getTime() < 3 * 864e5 && o.status !== 'trash').map((o) => ({ id: `o${o.id}`, at: new Date(o.date_created).toISOString(), type: 'order', text: `${orderName(o)} placed order #${o.number} · $${money(o.total)}`, ref: `#/orders/${o.id}`, source: 'store' })),
    ...recentReviews.map((r) => ({ id: `r${r.id}`, at: new Date(r.date_created).toISOString(), type: 'review', text: `${r.reviewer} rated ${r.product_name} ${r.rating}★${r.status === 'hold' ? ' · waiting for approval' : ''}`, ref: '#/reviews', source: 'store' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 16);

  const data = {
    range, generatedAt: new Date().toISOString(),
    kpis: { revenue: s.revenue, prevRevenue: s.prevRevenue, orders: s.orders, prevOrders: s.prevOrders, aov: s.aov, prevAov: s.prevAov, items: s.items, prevItems: s.prevItems, newBuyers: s.newBuyers, prevNewBuyers: s.prevNewBuyers },
    series: s.series.map((b) => ({ t: b.t, revenue: Math.round(b.revenue * 100) / 100, orders: b.orders })),
    buckets: w.buckets,
    target: { value: state.get().dailyTarget || autoTarget, custom: !!state.get().dailyTarget, today: today.revenue, todayOrders: today.orders },
    totals: {
      revenue: sales ? Number(sales.total_sales) : null, orders: statusTotals.reduce((a, x) => a + (x.slug === 'checkout-draft' ? 0 : x.total), 0),
      products: products.length, published: products.filter((p) => p.status === 'publish').length, customers: customersHead.total,
      offers: onSale.length + liveCoupons.length + state.get().campaigns.filter((c) => c.enabled).length,
    },
    status: { pending: totals.pending || 0, processing: totals.processing || 0, onHold: totals['on-hold'] || 0, completed: totals.completed || 0, cancelled: totals.cancelled || 0, refunded: totals.refunded || 0, failed: totals.failed || 0, mix: s.statusMix },
    attention: {
      pending: { count: pendingOrders.length, oldest: pendingOrders[0]?.date_created || null },
      onHold: totals['on-hold'] || 0,
      outOfStock: { count: out.length, sample: out.slice(0, 3).map((p) => p.name) },
      lowStock: { count: low.length, sample: low.slice(0, 3).map((p) => p.name) },
      reviews: held.total || 0,
      messages: unread,
      ending: salesEnding.length + couponsEnding.length,
    },
    recentOrders: orders.filter((o) => o.status !== 'trash').sort((a, b) => b.date_created.localeCompare(a.date_created)).slice(0, 9),
    lowStock: low.slice(0, 10), outOfStock: out.slice(0, 10),
    offers: { onSale: onSale.length, coupons: liveCoupons.length, campaigns: state.get().campaigns.filter((c) => c.enabled).length, list: onSale.sort((a, b) => (Number(b.regular_price) - Number(b.price)) / Number(b.regular_price) - (Number(a.regular_price) - Number(a.price)) / Number(a.regular_price)).slice(0, 6), coupon: liveCoupons.slice(0, 3).map((c) => ({ id: c.id, code: c.code, amount: c.amount, discount_type: c.discount_type, usage_count: c.usage_count, date_expires: c.date_expires })) },
    topProducts: boards.products.slice(0, 8).map((e) => ({ ...e, image: idx.product(e.id)?.image || null, stock: idx.product(e.id)?.stock_quantity ?? null })),
    categories: boards.categories.slice(0, 8), brands: boards.brands.slice(0, 6),
    recentCustomers: recentCustomers.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || c.email, email: c.email, city: c.billing?.city || '', date_created: c.date_created, orders: spend.get(c.id)?.orders || 0, spent: spend.get(c.id)?.total || 0 })),
    recentReviews: recentReviews.map((r) => ({ id: r.id, product_id: r.product_id, product_name: r.product_name, reviewer: r.reviewer, rating: r.rating, review: r.review.replace(/<[^>]+>/g, '').trim(), status: r.status, date_created: r.date_created })),
    activity,
  };
  dashCache.set(range, { at: Date.now(), data });
  return data;
});

/* ── products ────────────────────────────────────────────────────────── */
function sortProducts(list, sort) {
  const by = {
    newest: (a, b) => String(b.date_created).localeCompare(String(a.date_created)),
    updated: (a, b) => String(b.date_modified).localeCompare(String(a.date_modified)),
    name: (a, b) => a.name.localeCompare(b.name),
    'price-asc': (a, b) => Number(a.price) - Number(b.price),
    'price-desc': (a, b) => Number(b.price) - Number(a.price),
    stock: (a, b) => (a.stock_quantity ?? 1e9) - (b.stock_quantity ?? 1e9),
    sales: (a, b) => (b.total_sales || 0) - (a.total_sales || 0),
  }[sort] || ((a, b) => String(b.date_modified).localeCompare(String(a.date_modified)));
  return [...list].sort(by);
}
async function descendantIds(id) {
  const cats = await idx.categories();
  const out = new Set([Number(id)]);
  let grew = true;
  while (grew) { grew = false; for (const c of cats) if (out.has(c.parent) && !out.has(c.id)) { out.add(c.id); grew = true; } }
  return out;
}
router.get('/products', async ({ q }) => {
  await idx.syncProducts(q.get('fresh') === '1');
  const th = await idx.stockThresholds();
  let list = idx.products();
  const status = q.get('status') || 'all';
  list = status === 'all' ? list.filter((p) => p.status !== 'trash') : list.filter((p) => p.status === status);
  const s = (q.get('search') || '').trim().toLowerCase();
  if (s) list = list.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || String(p.id) === s);
  if (q.get('category')) { const ids = await descendantIds(q.get('category')); list = list.filter((p) => p.categories.some((c) => ids.has(c.id))); }
  if (q.get('stock')) list = list.filter((p) => stockLevel(p, th) === q.get('stock'));
  if (q.get('sale') === '1') list = list.filter((p) => p.on_sale);
  if (q.get('featured') === '1') list = list.filter((p) => p.featured);
  const counts = { all: 0, publish: 0, draft: 0, private: 0, pending: 0, trash: 0 };
  for (const p of idx.products()) { if (p.status !== 'trash') counts.all++; counts[p.status] = (counts[p.status] || 0) + 1; }
  const out = page(sortProducts(list, q.get('sort')), q);
  out.items = out.items.map((p) => ({ ...p, level: stockLevel(p, th) }));
  return { ...out, counts, syncedAt: idx.status().productsSyncedAt };
});
router.get('/products/:id', async ({ params }) => {
  const { data } = await woo.get(`/products/${params.id}`);
  idx.putProduct(data);
  return data;
});
const PRODUCT_KEYS = ['name', 'status', 'featured', 'catalog_visibility', 'description', 'short_description', 'sku', 'regular_price', 'sale_price', 'date_on_sale_from', 'date_on_sale_to', 'manage_stock', 'stock_quantity', 'stock_status', 'low_stock_amount', 'categories', 'images'];
const productPayload = (b) => {
  const out = {};
  for (const k of PRODUCT_KEYS) if (k in b) out[k] = b[k];
  if ('regular_price' in out) out.regular_price = out.regular_price === '' || out.regular_price == null ? '' : money(out.regular_price);
  if ('sale_price' in out) out.sale_price = out.sale_price === '' || out.sale_price == null ? '' : money(out.sale_price);
  if ('stock_quantity' in out) out.stock_quantity = n(out.stock_quantity);
  if ('low_stock_amount' in out) out.low_stock_amount = n(out.low_stock_amount);
  if (out.categories) out.categories = out.categories.map((c) => ({ id: Number(c.id ?? c) }));
  if (out.images) out.images = (Array.isArray(out.images) ? out.images : []).slice(0, 20).map((i) => (Number.isInteger(Number(i?.id)) && Number(i.id) > 0 ? { id: Number(i.id) } : { src: httpUrl(i?.src) })).filter((i) => i.id || i.src);
  for (const k of ['date_on_sale_from', 'date_on_sale_to']) if (k in out && !out[k]) out[k] = null;
  return out;
};
function validateProduct(b, creating, current) {
  if (creating && !String(b.name || '').trim()) throw new HttpError(400, 'Give the product a name.');
  if ('name' in b && !String(b.name || '').trim()) throw new HttpError(400, 'The product needs a name.');
  if (b.regular_price !== undefined && b.regular_price !== '' && b.regular_price !== null && !(Number(b.regular_price) >= 0)) throw new HttpError(400, 'Price must be a number.');
  if (b.sale_price !== undefined && b.sale_price !== '' && b.sale_price !== null && !(Number(b.sale_price) >= 0)) throw new HttpError(400, 'The sale price must be a number.');
  // Compare against the regular price the product will actually have (the one sent, or the one it already has).
  const regular = b.regular_price !== undefined ? b.regular_price : current?.regular_price;
  if (b.sale_price && regular !== '' && regular != null && Number(b.sale_price) >= Number(regular)) throw new HttpError(400, 'The sale price has to be lower than the regular price.');
  if (b.stock_quantity != null && b.stock_quantity !== '' && !Number.isInteger(Number(b.stock_quantity))) throw new HttpError(400, 'Stock must be a whole number.');
  if (b.stock_quantity != null && b.stock_quantity !== '' && Number(b.stock_quantity) < 0) throw new HttpError(400, 'Stock can’t be negative.');
}
router.post('/products', async ({ body }) => {
  validateProduct(body, true);
  const { data } = await woo.post('/products', productPayload(body));
  idx.putProduct(data);
  state.log('product', `Added ${data.name}${data.status === 'publish' ? '' : ' as a draft'}`, `#/products/${data.id}`);
  return data;
});
router.put('/products/:id', async ({ params, body }) => {
  const before = idx.product(params.id);
  validateProduct(body, false, before);
  const { data } = await woo.put(`/products/${params.id}`, productPayload(body));
  idx.putProduct(data);
  const what = before && before.status !== data.status ? (data.status === 'publish' ? 'Published' : data.status === 'draft' ? 'Unpublished' : 'Updated') : 'Updated';
  state.log('product', `${what} ${data.name}`, `#/products/${data.id}`);
  return data;
});
router.post('/products/:id/trash', async ({ params }) => {
  const { data } = await woo.del(`/products/${params.id}`, { force: false });
  idx.putProduct({ ...data, status: 'trash' });
  state.log('trash', `Moved ${data.name} to the trash`, '#/trash');
  return data;
});
router.post('/products/:id/restore', async ({ params, body }) => {
  const { data } = await woo.put(`/products/${params.id}`, { status: body.status === 'publish' ? 'publish' : 'draft' });
  idx.putProduct(data);
  state.log('product', `Restored ${data.name} from the trash`, `#/products/${data.id}`);
  return data;
});
router.del('/products/:id', async ({ params }) => {
  const p = idx.product(params.id) || (await woo.get(`/products/${params.id}`)).data;
  if (p.status !== 'trash') throw new HttpError(409, 'Move the product to the trash first. Permanent deletion only happens from the trash.');
  const { data } = await woo.del(`/products/${params.id}`, { force: true });
  idx.dropProduct(params.id);
  state.log('trash', `Permanently deleted ${data.name || p.name}`, null);
  return { ok: true };
});
router.post('/products/bulk', async ({ body }) => {
  const ids = (body.ids || []).map(Number).filter(Boolean).slice(0, 100);
  const patch = { publish: { status: 'publish' }, unpublish: { status: 'draft' }, feature: { featured: true }, unfeature: { featured: false } }[body.action];
  if (body.action === 'trash') {
    for (const id of ids) { const { data } = await woo.del(`/products/${id}`, { force: false }); idx.putProduct({ ...data, status: 'trash' }); }
    state.log('trash', `Moved ${ids.length} products to the trash`, '#/trash');
    return { ok: true, count: ids.length };
  }
  if (!patch) throw new HttpError(400, 'Unknown bulk action.');
  const { data } = await woo.post('/products/batch', { update: ids.map((id) => ({ id, ...patch })) });
  for (const p of data.update || []) if (p.id) idx.putProduct(p);
  state.log('product', `${{ publish: 'Published', unpublish: 'Unpublished', feature: 'Featured', unfeature: 'Unfeatured' }[body.action]} ${ids.length} products`, '#/products');
  return { ok: true, count: ids.length };
});

/* ── media (needs a WordPress application password) ─────────────────── */
router.post('/media', async ({ raw, q, req }) => {
  if (!wpMedia) throw new HttpError(501, 'Image upload needs WP_USER and WP_APP_PASSWORD in server/.env. You can paste an image URL instead.');
  if (READ_ONLY) throw new HttpError(403, 'The store connection is read-only.');
  const name = (q.get('filename') || 'image.jpg').replace(/[^\w.-]/g, '_');
  const res = await fetch(`${E.WOO_URL.replace(/\/$/, '')}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${wpMedia.user}:${wpMedia.pass}`).toString('base64')}`, 'Content-Type': req.headers['content-type'] || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` },
    body: raw,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, data.message || 'Upload failed.');
  return { id: data.id, src: data.source_url };
}, { raw: true });

/* ── categories & brands ─────────────────────────────────────────────── */
async function categoryTree(force) {
  const cats = await idx.categories(force);
  const brands = new Set(state.get().brandCategoryIds);
  return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent, description: c.description, count: c.count, menu_order: c.menu_order, image: c.image?.src || null, isBrand: brands.has(c.id) }));
}
router.get('/categories', async ({ q }) => ({ items: await categoryTree(q.get('fresh') === '1') }));
const catPayload = (b) => {
  const out = {};
  for (const k of ['name', 'slug', 'description', 'menu_order']) if (k in b) out[k] = b[k];
  if ('parent' in b) out.parent = Number(b.parent || 0);
  if ('image' in b) out.image = b.image ? { src: httpUrl(b.image) } : null;
  return out;
};
router.post('/categories', async ({ body }) => {
  if (!String(body.name || '').trim()) throw new HttpError(400, 'Give the category a name.');
  const { data } = await woo.post('/products/categories', catPayload(body));
  if (body.isBrand) state.update((s) => { s.brandCategoryIds = [...new Set([...s.brandCategoryIds, data.id])]; });
  idx.invalidateCategories();
  state.log('category', `Added ${body.isBrand ? 'brand' : 'category'} ${data.name}`, body.isBrand ? '#/brands' : '#/categories');
  return data;
});
router.put('/categories/:id', async ({ params, body }) => {
  const { data } = await woo.put(`/products/categories/${params.id}`, catPayload(body));
  if ('isBrand' in body) state.update((s) => { s.brandCategoryIds = body.isBrand ? [...new Set([...s.brandCategoryIds, data.id])] : s.brandCategoryIds.filter((x) => x !== data.id); });
  idx.invalidateCategories();
  state.log('category', `Updated ${data.name}`, '#/categories');
  return data;
});
router.del('/categories/:id', async ({ params, q }) => {
  if (q.get('confirm') !== 'delete') throw new HttpError(400, 'Category deletion is permanent in WooCommerce. Confirm it first.');
  const { data } = await woo.del(`/products/categories/${params.id}`, { force: true });
  state.update((s) => { s.brandCategoryIds = s.brandCategoryIds.filter((x) => x !== Number(params.id)); });
  idx.invalidateCategories();
  await idx.syncProducts(true);
  state.log('category', `Deleted category ${data.name}. Its products stay in the catalog.`, '#/categories');
  return { ok: true };
});
router.post('/categories/order', async ({ body }) => {
  const ids = (body.ids || []).map(Number);
  const cats = await idx.categories();
  for (let i = 0; i < ids.length; i++) {
    const c = cats.find((x) => x.id === ids[i]);
    if (c && c.menu_order !== i) await woo.put(`/products/categories/${ids[i]}`, { menu_order: i });
  }
  idx.invalidateCategories();
  state.log('homepage', 'Reordered top-level categories', '#/homepage');
  return { ok: true };
});
router.get('/brands', async () => {
  await idx.syncOrders();
  const tree = await categoryTree();
  const brands = tree.filter((c) => c.isBrand);
  const cats = await idx.categories();
  const classify = classifier(cats, state.get().brandCategoryIds);
  const boards = leaderboards(summarise(idx.orders(), windowFor('90d')).current.filter((o) => REVENUE.has(o.status)), (id) => idx.product(id), classify);
  const rev = new Map(boards.brands.map((b) => [b.id, b]));
  return { items: brands.map((b) => ({ ...b, revenue90: rev.get(b.id)?.revenue || 0, units90: rev.get(b.id)?.units || 0, children: tree.filter((c) => c.parent === b.id).length })), candidates: tree.filter((c) => !c.isBrand && c.parent === 0) };
});

/* ── inventory ───────────────────────────────────────────────────────── */
router.get('/inventory', async ({ q }) => {
  await idx.syncProducts(q.get('fresh') === '1');
  const th = await idx.stockThresholds();
  let list = idx.products().filter((p) => p.status !== 'trash').map((p) => ({ ...p, level: stockLevel(p, th) }));
  const counts = { all: list.length, low: 0, out: 0, ok: 0, untracked: 0 };
  for (const p of list) counts[p.level]++;
  if (q.get('level') && q.get('level') !== 'all') list = list.filter((p) => p.level === q.get('level'));
  const s = (q.get('search') || '').trim().toLowerCase();
  if (s) list = list.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s));
  const waiting = (id) => buyer?.waiting(id) || 0;
  list.sort((a, b) => ({ out: 0, low: 1, ok: 2, untracked: 3 }[a.level] - { out: 0, low: 1, ok: 2, untracked: 3 }[b.level]) || waiting(b.id) - waiting(a.id) || (a.stock_quantity ?? 1e9) - (b.stock_quantity ?? 1e9));
  const out = page(list, q, 30);
  out.items = out.items.map((p) => ({ ...p, waiting: waiting(p.id) }));
  return { ...out, counts, thresholds: th, waitingTotal: list.reduce((a, p) => a + waiting(p.id), 0) };
});
router.put('/inventory/:id', async ({ params, body }) => {
  const cur = idx.product(params.id) || (await woo.get(`/products/${params.id}`)).data;
  const patch = {};
  if ('manage_stock' in body) patch.manage_stock = !!body.manage_stock;
  if (body.adjust != null) patch.stock_quantity = Math.max(0, Number(cur.stock_quantity || 0) + Number(body.adjust));
  if (body.stock_quantity != null) patch.stock_quantity = Math.max(0, Math.round(Number(body.stock_quantity)));
  if ('stock_quantity' in patch) patch.manage_stock = true;
  if (body.stock_status && !(patch.manage_stock ?? cur.manage_stock)) patch.stock_status = body.stock_status;
  if ('low_stock_amount' in body) patch.low_stock_amount = n(body.low_stock_amount);
  const { data } = await woo.put(`/products/${params.id}`, patch);
  idx.putProduct(data);
  state.log('stock', `Stock for ${data.name}: ${data.manage_stock ? `${cur.stock_quantity ?? '—'} → ${data.stock_quantity}` : data.stock_status === 'instock' ? 'in stock' : 'out of stock'}`, `#/inventory`);
  if (buyer?.waiting(data.id) && data.stock_status === 'instock') buyer.sendStockAlerts(); // email the buyers waiting for it now
  return { ...slimProduct(data), level: stockLevel(slimProduct(data), await idx.stockThresholds()), waiting: buyer?.waiting(data.id) || 0 };
});

/* ── offers: per-product sales, campaigns, coupons ───────────────────── */
router.get('/offers', async () => {
  await idx.syncProducts();
  const [coupons, trashCoupons] = await Promise.all([woo.all('/coupons', {}, 5), Promise.resolve([])]);
  const products = idx.products().filter((p) => p.status !== 'trash');
  const camps = state.get().campaigns;
  const inCampaign = new Map();
  for (const c of camps) for (const id of c.applied || []) inCampaign.set(id, c.id);
  const sales = products.filter((p) => p.sale_price !== '' && p.sale_price != null).map((p) => ({ ...p, campaign: inCampaign.get(p.id) || null }));
  return { campaigns: camps, coupons: coupons.concat(trashCoupons), sales };
}, {});
async function campaignTargets(c) {
  await idx.syncProducts(true);
  const ids = new Set((c.productIds || []).map(Number));
  for (const cat of c.categoryIds || []) { const all = await descendantIds(cat); for (const p of idx.products()) if (p.status !== 'trash' && p.categories.some((x) => all.has(x.id))) ids.add(p.id); }
  return [...ids].map((id) => idx.product(id)).filter((p) => p && p.status !== 'trash' && Number(p.regular_price) > 0);
}
const salePriceFor = (c, regular) => money(c.type === 'percent' ? regular * (1 - c.value / 100) : Math.max(0, regular - c.value));
async function batchUpdate(updates) {
  const out = [];
  for (let i = 0; i < updates.length; i += 100) {
    const { data } = await woo.post('/products/batch', { update: updates.slice(i, i + 100) });
    for (const p of data.update || []) if (p.id) { idx.putProduct(p); out.push(p); }
  }
  return out;
}
async function applyCampaign(c) {
  // A campaign never raises a price: products already on a deeper sale keep theirs.
  const targets = (await campaignTargets(c)).filter((p) => !(p.sale_price !== '' && p.sale_price != null && Number(p.sale_price) <= Number(salePriceFor(c, Number(p.regular_price)))));
  c.previous = {};
  const updates = targets.map((p) => {
    c.previous[p.id] = { sale_price: p.sale_price ?? '', date_on_sale_from: p.date_on_sale_from, date_on_sale_to: p.date_on_sale_to };
    return { id: p.id, sale_price: salePriceFor(c, Number(p.regular_price)), date_on_sale_from: c.start || null, date_on_sale_to: c.end || null };
  });
  await batchUpdate(updates);
  c.applied = targets.map((p) => p.id);
  c.appliedPrices = Object.fromEntries(updates.map((u) => [u.id, u.sale_price]));
  c.enabled = true;
}
async function revertCampaign(c) {
  // Only roll back products still carrying this campaign's price, so later manual edits are not overwritten.
  await idx.syncProducts(true);
  const updates = (c.applied || []).map((id) => idx.product(id)).filter((p) => p && p.sale_price === c.appliedPrices?.[p.id])
    .map((p) => ({ id: p.id, sale_price: c.previous?.[p.id]?.sale_price ?? '', date_on_sale_from: c.previous?.[p.id]?.date_on_sale_from || null, date_on_sale_to: c.previous?.[p.id]?.date_on_sale_to || null }));
  await batchUpdate(updates);
  c.enabled = false;
  c.applied = [];
}
function validateCampaign(b) {
  if (!String(b.name || '').trim()) throw new HttpError(400, 'Give the offer a name.');
  if (!['percent', 'fixed'].includes(b.type)) throw new HttpError(400, 'Choose a percentage or a fixed amount.');
  const v = Number(b.value);
  if (!(v > 0) || (b.type === 'percent' && v >= 100)) throw new HttpError(400, b.type === 'percent' ? 'The discount must be between 1 and 99%.' : 'The discount must be more than $0.');
  if (!(b.productIds?.length || b.categoryIds?.length)) throw new HttpError(400, 'Pick at least one product or category.');
  if (b.start && b.end && new Date(b.end) <= new Date(b.start)) throw new HttpError(400, 'The end date must be after the start date.');
}
router.post('/campaigns', async ({ body }) => {
  validateCampaign(body);
  const c = { id: `c${Date.now().toString(36)}`, name: body.name.trim(), type: body.type, value: Number(body.value), start: body.start || null, end: body.end || null, productIds: (body.productIds || []).map(Number), categoryIds: (body.categoryIds || []).map(Number), createdAt: new Date().toISOString() };
  await applyCampaign(c);
  state.update((s) => { s.campaigns.unshift(c); });
  state.log('offer', `Started “${c.name}” on ${c.applied.length} products (${c.type === 'percent' ? `${c.value}%` : `$${c.value}`} off)`, '#/offers');
  return c;
});
router.put('/campaigns/:id', async ({ params, body }) => {
  validateCampaign(body);
  const c = state.get().campaigns.find((x) => x.id === params.id);
  if (!c) throw new HttpError(404, 'Offer not found.');
  if (c.enabled) await revertCampaign(c);
  Object.assign(c, { name: body.name.trim(), type: body.type, value: Number(body.value), start: body.start || null, end: body.end || null, productIds: (body.productIds || []).map(Number), categoryIds: (body.categoryIds || []).map(Number) });
  await applyCampaign(c);
  state.update(() => {});
  state.log('offer', `Updated “${c.name}” (${c.applied.length} products)`, '#/offers');
  return c;
});
router.post('/campaigns/:id/disable', async ({ params }) => {
  const c = state.get().campaigns.find((x) => x.id === params.id);
  if (!c) throw new HttpError(404, 'Offer not found.');
  await revertCampaign(c);
  state.update(() => {});
  state.log('offer', `Disabled “${c.name}”. Prices are back to normal.`, '#/offers');
  return c;
});
router.post('/campaigns/:id/enable', async ({ params }) => {
  const c = state.get().campaigns.find((x) => x.id === params.id);
  if (!c) throw new HttpError(404, 'Offer not found.');
  await applyCampaign(c);
  state.update(() => {});
  state.log('offer', `Re-enabled “${c.name}” on ${c.applied.length} products`, '#/offers');
  return c;
});
router.del('/campaigns/:id', async ({ params }) => {
  const c = state.get().campaigns.find((x) => x.id === params.id);
  if (!c) throw new HttpError(404, 'Offer not found.');
  if (c.enabled) await revertCampaign(c);
  state.update((s) => { s.campaigns = s.campaigns.filter((x) => x.id !== c.id); });
  state.log('offer', `Removed offer “${c.name}”`, '#/offers');
  return { ok: true };
});
const COUPON_KEYS = ['code', 'amount', 'discount_type', 'description', 'date_expires', 'individual_use', 'product_ids', 'product_categories', 'usage_limit', 'usage_limit_per_user', 'minimum_amount', 'free_shipping', 'status'];
const couponPayload = (b) => {
  const out = {};
  for (const k of COUPON_KEYS) if (k in b) out[k] = b[k];
  if ('amount' in out) out.amount = money(out.amount || 0);
  if ('minimum_amount' in out) out.minimum_amount = out.minimum_amount ? money(out.minimum_amount) : '';
  if ('usage_limit' in out) out.usage_limit = n(out.usage_limit);
  if ('date_expires' in out && !out.date_expires) out.date_expires = null;
  return out;
};
router.post('/coupons', async ({ body }) => {
  if (!/^[a-z0-9_-]{3,}$/i.test(body.code || '')) throw new HttpError(400, 'Coupon codes need at least 3 letters or numbers (no spaces).');
  if (!(Number(body.amount) > 0)) throw new HttpError(400, 'The discount must be more than 0.');
  const { data } = await woo.post('/coupons', couponPayload({ status: 'publish', ...body }));
  state.log('offer', `Created coupon ${data.code.toUpperCase()}`, '#/offers');
  return data;
});
router.put('/coupons/:id', async ({ params, body }) => {
  const { data } = await woo.put(`/coupons/${params.id}`, couponPayload(body));
  state.log('offer', `${body.status === 'draft' ? 'Disabled' : body.status === 'publish' && Object.keys(body).length === 1 ? 'Enabled' : 'Updated'} coupon ${data.code.toUpperCase()}`, '#/offers');
  return data;
});
router.post('/coupons/:id/trash', async ({ params }) => {
  const { data } = await woo.del(`/coupons/${params.id}`, { force: false });
  state.log('trash', `Moved coupon ${data.code.toUpperCase()} to the trash`, '#/trash');
  return data;
});
router.post('/coupons/:id/restore', async ({ params }) => {
  const { data } = await woo.put(`/coupons/${params.id}`, { status: 'draft' });
  state.log('offer', `Restored coupon ${data.code.toUpperCase()} (disabled until you enable it)`, '#/offers');
  return data;
});
router.del('/coupons/:id', async ({ params }) => {
  const { data: cur } = await woo.get(`/coupons/${params.id}`);
  if (cur.status !== 'trash') throw new HttpError(409, 'Move the coupon to the trash first.');
  await woo.del(`/coupons/${params.id}`, { force: true });
  state.log('trash', `Permanently deleted coupon ${cur.code.toUpperCase()}`, null);
  return { ok: true };
});

/* ── orders ──────────────────────────────────────────────────────────── */
const orderRow = (o) => ({ id: o.id, number: o.number, status: o.status, date_created: o.date_created, total: o.total, currency: o.currency, customer_id: o.customer_id, name: orderName(o), email: o.billing?.email, phone: o.billing?.phone, city: o.billing?.city || o.shipping?.city, payment: o.payment_method_title, note: !!o.customer_note, items: (o.line_items || o.items || []).map((l) => ({ name: l.name, quantity: l.quantity, image: l.image?.src ?? l.image ?? null })) });
router.get('/orders', async ({ q }) => {
  const status = q.get('status') || 'any';
  const res = await woo.get('/orders', { status, search: q.get('search') || undefined, page: q.get('page') || 1, per_page: Math.min(50, Number(q.get('per') || 20)), customer: q.get('customer') || undefined, after: q.get('after') || undefined, before: q.get('before') || undefined });
  const totals = Object.fromEntries((await woo.get('/reports/orders/totals')).data.map((x) => [x.slug, x.total]));
  return { items: res.data.map(orderRow), total: res.total, pages: res.pages, page: Number(q.get('page') || 1), totals };
});
async function orderDetail(id) {
  const [{ data: o }, { data: notes }] = await Promise.all([woo.get(`/orders/${id}`), woo.get(`/orders/${id}/notes`)]);
  idx.putOrder(o);
  await idx.syncOrders();
  const email = (o.billing?.email || '').toLowerCase();
  const history = idx.orders().filter((x) => (o.customer_id && x.customer_id === o.customer_id) || (email && x.billing.email?.toLowerCase() === email));
  return { ...o, notes, buyer: { orders: history.length, spent: history.filter((x) => REVENUE.has(x.status)).reduce((a, x) => a + Number(x.total), 0), first: history.map((x) => x.date_created).sort()[0] || o.date_created } };
}
router.get('/orders/:id', async ({ params }) => orderDetail(params.id));
router.put('/orders/:id/status', async ({ params, body }) => {
  if (!OWNER_STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status.');
  const { data } = await woo.put(`/orders/${params.id}`, { status: body.status });
  idx.putOrder(data);
  dashCache.clear();
  state.log('order', `Order #${data.number} → ${STATUS_LABEL[data.status]}`, `#/orders/${data.id}`);
  return orderDetail(params.id);
});
router.post('/orders/:id/notes', async ({ params, body }) => {
  if (!String(body.note || '').trim()) throw new HttpError(400, 'Write a note first.');
  const { data } = await woo.post(`/orders/${params.id}/notes`, { note: body.note.trim(), customer_note: !!body.toCustomer });
  if (body.toCustomer) ownerReplied(params.id);
  state.log(body.toCustomer ? 'message' : 'order', body.toCustomer ? `Replied to the buyer on order #${params.id}` : `Added a private note to order #${params.id}`, `#/orders/${params.id}`);
  return data;
});
router.post('/orders/:id/trash', async ({ params }) => {
  const { data } = await woo.del(`/orders/${params.id}`, { force: false });
  idx.putOrder({ ...data, status: 'trash' });
  dashCache.clear();
  state.log('trash', `Moved order #${data.number} to the trash`, '#/trash');
  return data;
});
router.post('/orders/:id/restore', async ({ params, body }) => {
  const status = OWNER_STATUSES.includes(body.status) ? body.status : 'on-hold';
  const { data } = await woo.put(`/orders/${params.id}`, { status });
  idx.putOrder(data);
  dashCache.clear();
  state.log('order', `Restored order #${data.number} as ${STATUS_LABEL[status]}`, `#/orders/${data.id}`);
  return data;
});
router.del('/orders/:id', async ({ params }) => {
  const { data: cur } = await woo.get(`/orders/${params.id}`);
  if (cur.status !== 'trash') throw new HttpError(409, 'Move the order to the trash first.');
  await woo.del(`/orders/${params.id}`, { force: true });
  idx.dropOrder(params.id);
  state.log('trash', `Permanently deleted order #${cur.number}`, null);
  return { ok: true };
});

/* ── buyers ──────────────────────────────────────────────────────────── */
router.get('/customers', async ({ q }) => {
  await idx.syncOrders();
  const stats = new Map();
  const keyOf = (o) => (o.customer_id ? `c${o.customer_id}` : `g${(o.billing.email || '').toLowerCase()}`);
  for (const o of idx.orders()) {
    if (o.status === 'trash') continue;
    const k = keyOf(o);
    const e = stats.get(k) || { orders: 0, spent: 0, last: '', first: o.date_created, city: o.billing.city, name: orderName(o), email: o.billing.email, phone: o.billing.phone };
    e.orders++; if (REVENUE.has(o.status)) e.spent += Number(o.total);
    if (o.date_created > e.last) e.last = o.date_created;
    if (o.date_created < e.first) e.first = o.date_created;
    stats.set(k, e);
  }
  const type = q.get('type') || 'registered';
  if (type === 'guest') {
    const s = (q.get('search') || '').toLowerCase();
    let list = [...stats.entries()].filter(([k]) => k.startsWith('g') && k.length > 1).map(([k, e]) => ({ id: null, guest: true, key: k.slice(1), ...e }));
    if (s) list = list.filter((x) => `${x.name} ${x.email} ${x.phone}`.toLowerCase().includes(s));
    list.sort((a, b) => b.last.localeCompare(a.last));
    return { ...page(list, q, 25), type };
  }
  const res = await woo.get('/customers', { search: q.get('search') || undefined, page: q.get('page') || 1, per_page: 25, orderby: 'registered_date', order: 'desc', role: 'customer' });
  const items = res.data.map((c) => { const e = stats.get(`c${c.id}`) || { orders: 0, spent: 0, last: '' }; return { id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || c.username, email: c.email, phone: c.billing?.phone, city: c.billing?.city, date_created: c.date_created, paying: c.is_paying_customer, orders: e.orders, spent: e.spent, last: e.last }; });
  return { items, total: res.total, pages: res.pages, page: Number(q.get('page') || 1), type };
});
router.get('/customers/guest/:email', async ({ params }) => {
  await idx.syncOrders();
  const email = params.email.toLowerCase();
  const orders = idx.orders().filter((o) => !o.customer_id && o.billing.email?.toLowerCase() === email && o.status !== 'trash');
  if (!orders.length) throw new HttpError(404, 'No guest orders for that email.');
  const { data: latest } = await woo.get(`/orders/${orders.sort((a, b) => b.date_created.localeCompare(a.date_created))[0].id}`);
  return { guest: true, email, first_name: latest.billing.first_name, last_name: latest.billing.last_name, billing: latest.billing, shipping: latest.shipping, orders: orders.map(orderRow), spent: orders.filter((o) => REVENUE.has(o.status)).reduce((a, o) => a + Number(o.total), 0) };
});
router.get('/customers/:id', async ({ params }) => {
  const [{ data: c }, { data: orders }] = await Promise.all([woo.get(`/customers/${params.id}`), woo.get('/orders', { customer: params.id, per_page: 50 })]);
  return { ...c, orders: orders.map(orderRow), spent: orders.filter((o) => REVENUE.has(o.status)).reduce((a, o) => a + Number(o.total), 0) };
});
router.put('/customers/:id', async ({ params, body }) => {
  const patch = {};
  for (const k of ['first_name', 'last_name', 'email']) if (k in body) patch[k] = plainText(body[k], 120);
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.email)) throw new HttpError(400, 'That email address does not look right.');
  const ADDR = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'email', 'phone'];
  for (const k of ['billing', 'shipping']) if (body[k] && typeof body[k] === 'object') patch[k] = Object.fromEntries(ADDR.filter((f) => f in body[k]).map((f) => [f, plainText(body[k][f], 120)]));
  const { data } = await woo.put(`/customers/${params.id}`, patch);
  state.log('customer', `Updated ${data.first_name} ${data.last_name}'s details`, `#/customers/${data.id}`);
  return data;
});

/* ── messages: buyer notes in, customer notes out (WooCommerce emails them) ── */
router.get('/messages', async ({ q }) => {
  await idx.syncOrders(q.get('fresh') === '1');
  const st = state.get();
  const replied = new Set([...st.activity.filter((a) => a.type === 'message' && a.ref && !/wrote about/.test(a.text)).map((a) => a.ref.split('/').pop()), ...Object.keys(st.ownerReplies || {})]);
  let threads = idx.orders().filter((o) => o.status !== 'trash' && (o.customer_note || replied.has(String(o.id)) || st.buyerMessages?.[o.id]))
    .map((o) => {
      const bm = st.buyerMessages?.[o.id];
      const latest = bm && bm.at > new Date(o.date_created).toISOString();
      return { id: o.id, number: o.number, name: orderName(o), email: o.billing.email, preview: latest ? bm.text : o.customer_note || '(you wrote first)', at: latest ? bm.at : o.date_created, unread: isUnread(o), replied: replied.has(String(o.id)), status: o.status };
    })
    .sort((a, b) => (b.unread - a.unread) || b.at.localeCompare(a.at));
  const unread = threads.filter((t) => t.unread).length;
  if (q.get('filter') === 'unread') threads = threads.filter((t) => t.unread);
  return { items: threads, unread };
});
router.get('/messages/:id', async ({ params }) => {
  const o = await orderDetail(params.id);
  state.update((s) => { s.messageReads[params.id] = new Date().toISOString(); });
  const thread = [];
  if (o.customer_note) thread.push({ id: 'buyer', from: 'buyer', text: o.customer_note, at: o.date_created, via: 'checkout' });
  for (const nt of [...o.notes].reverse()) {
    if (nt.customer_note) thread.push({ id: nt.id, from: 'owner', text: nt.note, at: nt.date_created });
    else if (String(nt.note).startsWith(BUYER_TAG)) thread.push({ id: nt.id, from: 'buyer', text: nt.note.slice(BUYER_TAG.length), at: nt.date_created, via: 'account' });
  }
  thread.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { order: o, thread };
});
router.post('/messages/:id', async ({ params, body }) => {
  if (!String(body.text || '').trim()) throw new HttpError(400, 'Write a reply first.');
  const { data } = await woo.post(`/orders/${params.id}/notes`, { note: body.text.trim(), customer_note: true });
  ownerReplied(params.id);
  state.log('message', `Replied to the buyer on order #${params.id}`, `#/messages/${params.id}`);
  return { id: data.id, from: 'owner', text: data.note, at: data.date_created };
});
router.post('/messages/:id/unread', async ({ params }) => { state.update((s) => { delete s.messageReads[params.id]; }); return { ok: true }; });

/* ── reviews ─────────────────────────────────────────────────────────── */
router.get('/reviews', async ({ q }) => {
  const status = q.get('status') || 'all';
  const res = await woo.get('/products/reviews', { status, search: q.get('search') || undefined, page: q.get('page') || 1, per_page: 20 });
  const counts = {};
  await Promise.all(['hold', 'approved', 'spam', 'trash'].map(async (s) => { counts[s] = (await woo.get('/products/reviews', { status: s, per_page: 1 })).total; }));
  return { items: res.data.map((r) => ({ ...r, review: r.review.replace(/<[^>]+>/g, '').trim(), image: idx.product(r.product_id)?.image || null })), total: res.total, pages: res.pages, page: Number(q.get('page') || 1), counts };
});
router.put('/reviews/:id', async ({ params, body }) => {
  if (!['approved', 'hold', 'spam', 'untrash', 'unspam'].includes(body.status)) throw new HttpError(400, 'Unknown review status.');
  const { data } = await woo.put(`/products/reviews/${params.id}`, { status: body.status });
  dashCache.clear();
  state.log('review', `${{ approved: 'Approved', hold: 'Unpublished', spam: 'Marked as spam', untrash: 'Restored', unspam: 'Un-spammed' }[body.status]} ${data.reviewer}'s review of ${data.product_name}`, '#/reviews');
  return data;
});
router.post('/reviews/:id/trash', async ({ params }) => {
  const { data } = await woo.del(`/products/reviews/${params.id}`, { force: false });
  state.log('trash', `Moved ${data.reviewer}'s review to the trash`, '#/trash');
  return data;
});
router.del('/reviews/:id', async ({ params }) => {
  const { data: cur } = await woo.get(`/products/reviews/${params.id}`);
  if (cur.status !== 'trash') throw new HttpError(409, 'Move the review to the trash first.');
  await woo.del(`/products/reviews/${params.id}`, { force: true });
  state.log('trash', `Permanently deleted ${cur.reviewer}'s review`, null);
  return { ok: true };
});

/* ── homepage: what WooCommerce controls (featured, on sale, best sellers, category order) ── */
router.get('/homepage', async () => {
  await Promise.all([idx.syncProducts(), idx.syncOrders()]);
  const products = idx.products().filter((p) => p.status === 'publish');
  const cats = await categoryTree();
  const thirty = summarise(idx.orders(), windowFor('30d'));
  const best = leaderboards(thirty.current.filter((o) => REVENUE.has(o.status)), (id) => idx.product(id), () => ({ category: { id: 0, name: '' }, brand: null })).products.slice(0, 8).map((e) => ({ ...e, image: idx.product(e.id)?.image || null, price: idx.product(e.id)?.price }));
  return {
    featured: products.filter((p) => p.featured),
    onSale: products.filter((p) => p.on_sale).sort((a, b) => String(b.date_modified).localeCompare(String(a.date_modified))).slice(0, 12),
    bestSellers: best,
    categories: cats.filter((c) => c.parent === 0).sort((a, b) => a.menu_order - b.menu_order),
    builderUrl: configured && ENV !== 'emulator' ? `${E.WOO_URL.replace(/\/$/, '')}/wp-admin/edit.php?post_type=page` : null,
  };
});

/* ── notifications (computed from the store, read-state kept here) ───── */
async function notificationList() {
  await Promise.all([idx.syncProducts(), idx.syncOrders()]);
  const th = await idx.stockThresholds();
  const st = state.get();
  const out = [];
  const t = Date.now();
  for (const o of idx.orders().filter((x) => x.status !== 'trash' && t - new Date(x.date_created).getTime() < 3 * 864e5)) out.push({ id: `order-${o.id}`, kind: 'order', level: 'info', title: `New order #${o.number}`, text: `${orderName(o)} · $${money(o.total)} · ${o.items.length} item${o.items.length === 1 ? '' : 's'}`, at: new Date(o.date_created).toISOString(), link: `#/orders/${o.id}` });
  for (const o of idx.orders().filter((x) => x.status === 'pending' && t - new Date(x.date_created).getTime() > 24 * 3600e3)) out.push({ id: `late-${o.id}`, kind: 'order', level: 'warn', title: `Order #${o.number} has been pending for over a day`, text: orderName(o), at: new Date(new Date(o.date_created).getTime() + 24 * 3600e3).toISOString(), link: `#/orders/${o.id}` });
  for (const o of idx.orders().filter((x) => x.status !== 'trash' && isUnread(x))) {
    const bm = st.buyerMessages?.[o.id];
    out.push(bm ? { id: `bmsg-${o.id}-${bm.at}`, kind: 'message', level: 'info', title: `${orderName(o)} replied about order #${o.number}`, text: bm.text, at: bm.at, link: `#/messages/${o.id}` }
      : { id: `msg-${o.id}`, kind: 'message', level: 'info', title: `${orderName(o)} left a message`, text: o.customer_note, at: new Date(o.date_created).toISOString(), link: `#/messages/${o.id}` });
  }
  for (const p of idx.products().filter((x) => x.status === 'publish')) {
    const lv = stockLevel(p, th);
    if (lv === 'out') out.push({ id: `out-${p.id}`, kind: 'stock', level: 'danger', title: `${p.name} is out of stock`, text: 'Restock it or hide it from the shop.', at: p.date_modified ? new Date(p.date_modified).toISOString() : null, link: `#/inventory?focus=${p.id}` });
    else if (lv === 'low') out.push({ id: `low-${p.id}`, kind: 'stock', level: 'warn', title: `${p.name} is running low`, text: `${p.stock_quantity} left`, at: p.date_modified ? new Date(p.date_modified).toISOString() : null, link: `#/inventory?focus=${p.id}` });
  }
  try {
    const { data: held } = await woo.get('/products/reviews', { status: 'hold', per_page: 20 });
    for (const r of held) out.push({ id: `rev-${r.id}`, kind: 'review', level: r.rating <= 2 ? 'warn' : 'info', title: `${r.reviewer}'s ${r.rating}★ review is waiting`, text: r.product_name, at: new Date(r.date_created).toISOString(), link: '#/reviews?status=hold' });
  } catch { /* reviews optional */ }
  const seen = st.notificationsSeenAt ? new Date(st.notificationsSeenAt).getTime() : 0;
  return out.filter((x) => !st.dismissed.includes(x.id)).map((x) => ({ ...x, unseen: x.at ? new Date(x.at).getTime() > seen : false })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
router.get('/notifications', async () => { const items = await notificationList(); return { items, unseen: items.filter((x) => x.unseen).length }; });
router.post('/notifications/seen', async () => { state.update((s) => { s.notificationsSeenAt = new Date().toISOString(); }); return { ok: true }; });
router.post('/notifications/:id/dismiss', async ({ params }) => { state.update((s) => { s.dismissed = [...new Set([...s.dismissed, params.id])].slice(-500); }); return { ok: true }; });

/* ── trash ───────────────────────────────────────────────────────────── */
router.get('/trash', async () => {
  await idx.syncProducts(true);
  const [orders, reviews, coupons] = await Promise.all([
    woo.get('/orders', { status: 'trash', per_page: 50 }).then((r) => r.data.map(orderRow)),
    woo.get('/products/reviews', { status: 'trash', per_page: 50 }).then((r) => r.data.map((x) => ({ ...x, review: x.review.replace(/<[^>]+>/g, '').trim() }))),
    woo.get('/coupons', { status: 'trash', per_page: 50 }).then((r) => r.data.filter((c) => c.status === 'trash')).catch(() => []),
  ]);
  return { products: idx.products().filter((p) => p.status === 'trash'), orders, reviews, coupons };
});

/* Sidebar counts: cheap, from the mirrors (plus one review count). */
router.get('/badges', async () => {
  await Promise.all([idx.syncProducts(), idx.syncOrders()]);
  const th = await idx.stockThresholds();
  let low = 0, out = 0;
  for (const p of idx.products()) { if (p.status !== 'publish') continue; const lv = stockLevel(p, th); if (lv === 'low') low++; else if (lv === 'out') out++; }
  const held = await woo.get('/products/reviews', { status: 'hold', per_page: 1 }).then((r) => r.total).catch(() => 0);
  const seen = state.get().notificationsSeenAt ? new Date(state.get().notificationsSeenAt).getTime() : 0;
  const fresh = idx.orders().filter((o) => o.status !== 'trash' && new Date(o.date_created).getTime() > Math.max(seen, Date.now() - 3 * 864e5)).length;
  return {
    pending: idx.orders().filter((o) => o.status === 'pending').length,
    messages: idx.orders().filter((o) => o.status !== 'trash' && isUnread(o)).length,
    reviews: held, low, out, notifications: fresh + held,
    trash: idx.products().filter((p) => p.status === 'trash').length,
  };
});

/* ── activity, search, settings ──────────────────────────────────────── */
router.get('/activity', async () => ({ items: state.get().activity.slice(0, 100) }));
router.get('/search', async ({ q }) => {
  const s = (q.get('q') || '').trim().toLowerCase();
  if (s.length < 2) return { products: [], orders: [], customers: [] };
  await Promise.all([idx.syncProducts(), idx.syncOrders()]);
  const products = idx.products().filter((p) => p.status !== 'trash' && (p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))).slice(0, 6);
  const orders = idx.orders().filter((o) => o.status !== 'trash' && `${o.number} ${orderName(o)} ${o.billing.email} ${o.billing.phone}`.toLowerCase().includes(s.replace(/^#/, ''))).sort((a, b) => b.date_created.localeCompare(a.date_created)).slice(0, 5).map(orderRow);
  const customers = (await woo.get('/customers', { search: s, per_page: 5, role: 'customer' }).catch(() => ({ data: [] }))).data.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || c.email, email: c.email }));
  return { products, orders, customers };
});
const STORE_SETTINGS = {
  general: ['woocommerce_store_address', 'woocommerce_store_address_2', 'woocommerce_store_city', 'woocommerce_store_postcode', 'woocommerce_default_country', 'woocommerce_currency', 'woocommerce_price_num_decimals', 'woocommerce_enable_coupons'],
  products: ['woocommerce_manage_stock', 'woocommerce_notify_low_stock_amount', 'woocommerce_notify_no_stock_amount', 'woocommerce_hide_out_of_stock_items', 'woocommerce_enable_reviews', 'woocommerce_review_rating_verification_required'],
};
router.get('/settings', async () => {
  const groups = {};
  for (const [g, ids] of Object.entries(STORE_SETTINGS)) {
    const { data } = await woo.get(`/settings/${g}`);
    groups[g] = ids.map((id) => data.find((s) => s.id === id)).filter(Boolean).map((s) => ({ id: s.id, label: s.label, type: s.type, value: s.value, options: s.options || null, description: s.description || '' }));
  }
  return { store: groups, admin: { dailyTarget: state.get().dailyTarget }, connection: { url: E.WOO_URL, env: ENV, readOnly: READ_ONLY, media: !!wpMedia, ...idx.status() } };
});
router.put('/settings/store', async ({ body }) => {
  const byGroup = {};
  for (const u of body.updates || []) {
    if (!STORE_SETTINGS[u.group]?.includes(u.id)) throw new HttpError(400, `Setting ${u.id} can't be changed here.`);
    (byGroup[u.group] ||= []).push({ id: u.id, value: String(u.value) });
  }
  for (const [g, update] of Object.entries(byGroup)) await woo.post(`/settings/${g}/batch`, { update });
  dashCache.clear();
  state.log('settings', `Changed ${body.updates.length} store setting${body.updates.length === 1 ? '' : 's'}`, '#/settings');
  return { ok: true };
});
router.put('/settings/admin', async ({ body }) => {
  state.update((s) => { s.dailyTarget = body.dailyTarget ? Math.max(1, Math.round(Number(body.dailyTarget))) : null; });
  dashCache.clear();
  return { ok: true };
});
const ownerPwChecks = limiter(5, 15 * 60e3);
router.post('/settings/password', async ({ body, res }) => {
  if (!ownerPwChecks.ok('owner')) throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes.');
  if (typeof body.current !== 'string' || typeof body.next !== 'string' || body.current.length > 256) throw new HttpError(400, 'Enter your current and new password.');
  if (!verifyPassword(body.current, E.OWNER_PASSWORD_HASH)) { ownerPwChecks.add('owner'); throw new HttpError(401, 'Your current password is not right.'); }
  ownerPwChecks.clear('owner');
  const problem = passwordError(body.next);
  if (problem) throw new HttpError(400, problem);
  if (body.next === body.current) throw new HttpError(400, 'Choose a password that is different from the current one.');
  if (body.confirm !== undefined && body.confirm !== body.next) throw new HttpError(400, 'The two new passwords don’t match.');
  const hash = hashPassword(body.next);
  setEnvValue(ENV_FILE, 'OWNER_PASSWORD_HASH', hash);
  E.OWNER_PASSWORD_HASH = hash; // every other session is now invalid (the signing key includes the hash)
  res.setHeader('Set-Cookie', ownerCookie(sessions.issue())); // ...but this device stays signed in
  state.log('settings', 'Changed the owner password; other devices were signed out', null);
  return { ok: true };
});
router.post('/settings/resync', async () => {
  await Promise.all([idx.syncProducts(true), idx.syncOrders(true), idx.categories(true)]);
  dashCache.clear();
  return idx.status();
});

/* ── server ──────────────────────────────────────────────────────────── */
const API = '/admin/api';
const WRITE = new Set(['POST', 'PUT', 'DELETE']);
const adminCalls = limiter(600, 60e3); // per address, generous for one busy owner
const buyerCalls = limiter(240, 60e3); // per address, for the public storefront API
const NOTIFICATION_ID = /^[a-z]+-[\w:.-]{1,90}$/i;
const CAMPAIGN_ID = /^c[a-z0-9]{4,24}$/;
/** Route parameters are validated before any handler (and so before any WooCommerce URL) sees them. */
function checkParams(path, params) {
  for (const [k, v] of Object.entries(params)) {
    if (k === 'id') {
      if (path.startsWith('/campaigns/')) { if (!CAMPAIGN_ID.test(v)) throw new HttpError(400, 'Invalid id.', 'bad_id'); }
      else if (path.startsWith('/notifications/')) { if (!NOTIFICATION_ID.test(v)) throw new HttpError(400, 'Invalid id.', 'bad_id'); }
      else idParam(v);
    } else if (k === 'email') {
      if (v.length > 120 || !/^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]{2,}$/.test(v)) throw new HttpError(400, 'Invalid email.', 'bad_email');
    }
  }
}
/** Writes must be JSON (or a raw upload where the route expects one): blocks form-based cross-site posts. */
function checkContentType(req, raw) {
  if (!WRITE.has(req.method)) return;
  const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (raw) { if (!/^(image\/(jpeg|png|webp|gif))$/.test(ct)) throw new HttpError(415, 'Upload a JPEG, PNG, WebP or GIF image.'); return; }
  if (ct !== 'application/json' && !(req.headers['content-length'] === '0' || req.headers['content-length'] === undefined && ct === '')) throw new HttpError(415, 'Send JSON.');
}
const sendJson = (res, status, body) => { if (res.headersSent) return res.end(); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

/* Storefront buyer API (/api). Never reads the owner's cookie; WooCommerce error details are not passed to buyers. */
async function handleBuyer(req, res, url, trusted, ip) {
  try {
    if (!buyerCalls.hit(ip)) throw new HttpError(429, 'Too many requests. Please slow down and try again in a minute.');
    if (!buyer) throw new HttpError(503, 'The store isn’t connected yet.');
    const path = url.pathname.slice(4) || '/';
    const r = buyer.router.match(req.method, path);
    if (!r) throw new HttpError(404, 'Not found.');
    if (!trusted) throw new HttpError(403, 'Origin not allowed.');
    if (WRITE.has(req.method) && !req.headers.origin && req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site request blocked.');
    checkParams(path, r.params);
    checkContentType(req, false);
    const raw = WRITE.has(req.method) ? await readBody(req, 2e5) : null;
    let body = {};
    if (raw && raw.length) { try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
    const data = await r.handler({ req, res, q: url.searchParams, params: r.params, body, ip, session: buyer.sessionOf(req) });
    if (req.method !== 'GET') dashCache.clear();
    sendJson(res, 200, data ?? { ok: true });
  } catch (e) {
    if (!(e instanceof HttpError)) {
      console.error('[buyer api]', e.code || '', e.message);
      return sendJson(res, e.code === 'read_only' ? 503 : 502, { error: e.code === 'read_only' ? 'The store is in read-only mode right now.' : 'The store didn’t answer as expected. Please try again.', code: 'store_error' });
    }
    sendJson(res, e.status, { error: e.message, code: e.code || null, ...(e.fields ? { fields: e.fields } : {}) });
  }
}

async function handleAdminApi(req, res, url, trusted, ip) {
  try {
    if (!adminCalls.hit(ip)) throw new HttpError(429, 'Too many requests. Wait a moment.');
    const path = url.pathname.slice(API.length) || '/';
    const r = router.match(req.method, path);
    if (!r) throw new HttpError(404, 'Not found.');
    if (!trusted) throw new HttpError(403, 'Origin not allowed.');
    const authed = !!(sessions && sessions.valid(parseCookies(req.headers.cookie).dmd_admin));
    if (!r.opts.public && (!configured || !authed)) throw new HttpError(401, configured ? 'Sign in first.' : 'The admin server is not configured yet.');
    if (WRITE.has(req.method) && !req.headers.origin && req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site request blocked.');
    checkParams(path, r.params);
    checkContentType(req, !!r.opts.raw);
    const raw = WRITE.has(req.method) ? await readBody(req, r.opts.raw ? 15e6 : 2e6) : null;
    let body = {};
    if (raw && !r.opts.raw && raw.length) { try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
    const data = await r.handler({ req, res, q: url.searchParams, params: r.params, body, raw, ip, authed });
    if (req.method !== 'GET') dashCache.clear(); // any change shows up on the dashboard straight away
    if (req.method !== 'GET' && /^\/(reviews|trash)/.test(path)) buyer?.bustReviews(); // storefront ratings follow moderation
    if (req.method !== 'GET' && /^\/(products|inventory|campaigns|categories|orders|trash|settings)/.test(path)) buyer?.bustCatalog(); // storefront prices and stock follow at once
    sendJson(res, 200, data ?? { ok: true });
  } catch (e) {
    if (!(e instanceof HttpError) && !(e instanceof WooError)) console.error(e);
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    sendJson(res, status, { error: status === 500 ? 'Something went wrong on the server.' : e.message || 'Something went wrong.', code: e.code || null });
  }
}

/* ── health, robots and sitemap ──────────────────────────────────────── */
let health = { at: 0, data: null };
async function healthCheck() {
  if (health.data && Date.now() - health.at < 15e3) return health.data;
  let reachable = false;
  if (configured) { try { await woo.get('/products', { per_page: 1, _fields: 'id' }); reachable = true; } catch { /* reported below */ } }
  health = { at: Date.now(), data: { ok: configured && reachable, configured, store: reachable, uptime: Math.round((Date.now() - STARTED) / 1000) } };
  return health.data;
}
const xml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let sitemapCache = null;
async function sitemap() {
  if (sitemapCache && Date.now() - sitemapCache.at < 10 * 60e3) return sitemapCache.body;
  const paths = ['/', '/shop', '/categories', '/brands', '/contact', catUrl(NEW_OFFERS.slug)];
  const walk = (node) => { paths.push(catUrl(...node.path)); node.children.forEach(walk); };
  DMD_GROUPS.forEach(walk);
  let products = [];
  try { products = JSON.parse((await buyer.catalog()).body).products; } catch { /* the static pages are still listed */ }
  const urls = [...paths.map((u) => `  <url><loc>${xml(STOREFRONT_URL + u)}</loc></url>`), ...products.map((r) => `  <url><loc>${xml(`${STOREFRONT_URL}/product/${r[0]}`)}</loc></url>`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  sitemapCache = { at: Date.now(), body };
  return body;
}
const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\nDisallow: /order/\nSitemap: ${STOREFRONT_URL}/sitemap.xml\n`;

/* Request log: errors, slow requests and refusals always; everything with LOG_REQUESTS=true. Query strings are
   never logged (they can carry order keys and reset tokens). */
function logRequest(req, res, path, ip, started) {
  const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  const refused = [401, 403, 429].includes(res.statusCode);
  if (!LOG_REQUESTS && res.statusCode < 500 && ms < 3000 && !refused) return;
  console.log(`${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} ${ms}ms${refused || res.statusCode >= 500 ? ` ${ip}` : ''}`);
}

const server = http.createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  try {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Bad request'); }
    const ip = clientIp(req, TRUST_PROXY);
    res.on('finish', () => logRequest(req, res, url.pathname.slice(0, 200), ip, started));
    const origin = req.headers.origin;
    // The built admin is served from this server, so its own origin is always trusted; the dev UI's origin is listed.
    const sameOrigin = !!origin && (() => { try { return new URL(origin).host === req.headers.host; } catch { return false; } })();
    const trusted = !origin || sameOrigin || ORIGINS.includes(origin);
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith(API);
    securityHeaders(res, isApi ? 'api' : 'page', { https: HTTPS });
    if (origin && !sameOrigin && ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      if (!trusted) { res.writeHead(403); return res.end(); }
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    // /healthz: is this server up (for the reverse proxy). /healthz?store=1: and can it reach WooCommerce (for monitoring).
    if (url.pathname === '/healthz') {
      const h = await healthCheck();
      const up = url.searchParams.get('store') === '1' ? h.ok : h.configured;
      res.writeHead(up ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(h));
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleBuyer(req, res, url, trusted, ip);
    if (url.pathname.startsWith(API)) return await handleAdminApi(req, res, url, trusted, ip);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (existsSync(ADMIN_DIST) && serveStatic(res, ADMIN_DIST, url.pathname.replace(/^\/admin\/?/, ''), req)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    if (SERVE_STOREFRONT) {
      if (url.pathname === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return res.end(ROBOTS); }
      if (url.pathname === '/sitemap.xml' && buyer) { res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' }); return res.end(await sitemap()); }
      if (existsSync(STOREFRONT_DIST) && serveSpa(req, res, STOREFRONT_DIST, url.pathname)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    if (url.pathname === '/') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
  } catch (e) {
    // Last line of defence: one bad request never takes the server down.
    console.error('[server]', e?.message || e);
    try { if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server error'); } catch { /* socket gone */ }
  }
});
server.headersTimeout = 15000; // slow-header connections are dropped
server.requestTimeout = 60000; // whole request (uploads included) must arrive within a minute
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;
server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
process.on('unhandledRejection', (e) => console.error('[unhandled]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaught]', e?.stack || e?.message || e));

// Graceful stop (deploys, Ctrl+C): finish requests in flight, save buyer sessions, then exit.
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: finishing open requests, then stopping.`);
  const done = () => { try { buyer?.flush(); } catch (e) { console.error('[shutdown]', e.message); } process.exit(0); };
  server.close(done);
  server.closeIdleConnections?.();
  setTimeout(done, 8000).unref();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`DMD World server on http://${HOST}:${PORT} (admin ${API}, storefront /api${SERVE_STOREFRONT ? ', storefront pages' : ''})  ·  store: ${configured ? `${ENV}${READ_ONLY ? ', read-only' : ''}` : `not configured (missing ${missing.join(', ')})`}`);
});
