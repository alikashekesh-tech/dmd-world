// Buyer accounts for the storefront, under /api. Completely separate from the owner's /admin/api:
//  - its own cookie (dmd_buyer, Path=/api) holding a random token; only its SHA-256 is stored server-side,
//  - every /me route takes the buyer's customer id from that session, never from the request,
//  - accounts are real WooCommerce/WordPress customers; passwords are checked by WordPress through the
//    DMD Buyer Auth plugin (wordpress/dmd-buyer-auth), so buyers keep one login for the whole store.
// Also public storefront data: the live catalog, live cart quotes (prices, stock, coupons), ratings and reviews.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRouter, HttpError, parseCookies, compressed } from './lib/http.mjs';
import { passwordError } from '../shared/passwordPolicy.js';
import { plainText, limiter } from './lib/security.mjs';
import { readJson, writeJsonAtomic } from './lib/files.mjs';
import { stockLevel } from './lib/indexes.mjs';

const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
export const BUYER_TAG = '[Buyer message] '; // marks a buyer's message stored as an order note
const PAID = new Set(['processing', 'completed']);
const ADDRESS_KEYS = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country'];
const PAYMENTS = { cod: 'Cash on delivery', bacs: 'Direct bank transfer' };
const MAX_QTY = 10;

const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
// Single-line fields (names, addresses, phone): no tags, no control characters.
const clean = (v, max = 200) => (typeof v === 'string' || typeof v === 'number' ? plainText(String(v).replace(/[\r\n\t]+/g, ' '), max) : '');
// Multi-line text: keeps line breaks; markup is escaped when stored (reviews, messages) or stripped (order note).
const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripTags = (s) => unescapeHtml(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '')).trim();
const cents = (n) => Math.round(Number(n) * 100) / 100;
const money = (n) => cents(n).toFixed(2);

/** Review text is stored as "<strong>Title</strong>" + body, so plain WooCommerce keeps the title. */
export function parseReview(html) {
  const m = String(html || '').match(/^\s*(?:<p>\s*)?<strong>([\s\S]*?)<\/strong>\s*(?:<br\s*\/?>|<\/p>)?/i);
  return m ? { title: stripTags(m[1]), text: stripTags(String(html).slice(m[0].length)) } : { title: null, text: stripTags(html) };
}

/** Whether a coupon covers one product, following WooCommerce's rules (WC_Coupon::is_valid_for_product). */
function couponCovers(c, p, catsOf) {
  const ids = (c.product_ids || []).map(Number), cats = (c.product_categories || []).map(Number);
  const mine = catsOf(p);
  let ok = !ids.length && !cats.length;
  if (ids.includes(p.id)) ok = true;
  if (cats.length && mine.some((x) => cats.includes(x))) ok = true;
  if ((c.excluded_product_ids || []).map(Number).includes(p.id)) ok = false;
  if ((c.excluded_product_categories || []).map(Number).some((x) => mine.includes(x))) ok = false;
  if (c.exclude_sale_items && p.on_sale) ok = false;
  return ok;
}

/**
 * The discount a coupon gives on priced cart lines, or the reason it can't be used — the same checks WooCommerce
 * makes when the order is placed (which stays the final authority on the total).
 */
export function couponDiscount(c, lines, { catsOf, email, customerId, now = Date.now() }) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  if (!c || c.status !== 'publish') return { problem: 'That code isn’t valid.' };
  if (c.date_expires && new Date(c.date_expires).getTime() < now) return { problem: 'That code has expired.' };
  if (c.usage_limit && Number(c.usage_count) >= Number(c.usage_limit)) return { problem: 'That code has been used up.' };
  if (c.usage_limit_per_user && (email || customerId)) {
    const mine = (c.used_by || []).filter((u) => String(u).toLowerCase() === String(email || '').toLowerCase() || (customerId && String(u) === String(customerId))).length;
    if (mine >= Number(c.usage_limit_per_user)) return { problem: 'You’ve already used this code.' };
  }
  const min = Number(c.minimum_amount) || 0, max = Number(c.maximum_amount) || 0;
  if (min > 0 && subtotal < min) return { problem: `Spend at least $${money(min)} to use this code.` };
  if (max > 0 && subtotal > max) return { problem: `This code works on orders up to $${money(max)}.` };
  const covered = lines.filter((l) => couponCovers(c, l.p, catsOf));
  if (!covered.length) return { problem: 'That code doesn’t apply to anything in your cart.' };
  const amount = Number(c.amount) || 0;
  let discount = 0;
  if (c.discount_type === 'percent') discount = covered.reduce((a, l) => a + l.price * l.qty, 0) * Math.min(100, amount) / 100;
  else if (c.discount_type === 'fixed_product') discount = covered.reduce((a, l) => a + Math.min(amount, l.price) * l.qty, 0);
  else {
    // A fixed cart discount can't be combined with excluded products in the cart.
    if (lines.some((l) => !couponCovers({ ...c, product_ids: [], product_categories: [] }, l.p, catsOf))) return { problem: 'That code can’t be used with some items in your cart.' };
    discount = amount;
  }
  return { discount: cents(Math.min(discount, subtotal)) };
}

export function createBuyerApi({ woo, idx, state, file, wooUrl, authSecret, storefrontUrl, cookieSecure, log }) {
  /* ── server-side sessions, reset tokens, read-state and stock alerts ── */
  mkdirSync(dirname(file), { recursive: true });
  const store = { sessions: {}, resets: {}, reads: {}, alerts: {}, ...readJson(file, {}, log) };
  store.alerts ||= {};
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; writeJsonAtomic(file, store); };
  const persist = () => { clearTimeout(timer); timer = setTimeout(flush, 100); };
  const prune = () => { const t = Date.now(); for (const k of ['sessions', 'resets']) for (const [h, v] of Object.entries(store[k])) if (v.exp < t) delete store[k][h]; persist(); };
  prune(); setInterval(prune, 3600e3).unref();

  const cookie = (token, maxAge) => `dmd_buyer=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${maxAge}${cookieSecure ? '; Secure' : ''}`;
  function startSession(res, customerId) {
    const token = randomBytes(32).toString('base64url');
    store.sessions[sha(token)] = { c: customerId, exp: Date.now() + SESSION_DAYS * 864e5, at: Date.now() };
    // At most 10 signed-in devices per account: the oldest sessions end first.
    const mine = Object.entries(store.sessions).filter(([, v]) => v.c === customerId).sort((a, b) => b[1].at - a[1].at);
    for (const [h] of mine.slice(10)) delete store.sessions[h];
    persist();
    res.setHeader('Set-Cookie', cookie(token, SESSION_DAYS * 86400));
  }
  function sessionOf(req) {
    const token = parseCookies(req.headers.cookie).dmd_buyer;
    if (!token || token.length > 100) return null;
    const key = sha(token);
    const s = store.sessions[key];
    if (!s || s.exp < Date.now()) return null;
    return { customerId: s.c, key };
  }
  const endSessions = (customerId, exceptKey) => { for (const [h, v] of Object.entries(store.sessions)) if (v.c === customerId && h !== exceptKey) delete store.sessions[h]; persist(); };

  /* ── WordPress password checks and mail (DMD Buyer Auth plugin) ─────── */
  const accountsOn = !!authSecret && authSecret.length >= 32;
  async function plugin(path, body) {
    if (!accountsOn) throw new HttpError(503, 'Accounts aren’t switched on yet. Please check out as a guest for now.', 'accounts_off');
    let res;
    try {
      res = await fetch(`${wooUrl.replace(/\/$/, '')}/wp-json/dmd/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DMD-Secret': authSecret }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    } catch { throw new HttpError(503, 'The store can’t be reached right now. Please try again in a moment.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status >= 500 || res.status === 403 || res.status === 404) { log?.(`DMD Buyer Auth plugin ${path} answered ${res.status}`); throw new HttpError(503, 'Sign-in is temporarily unavailable. Please try again shortly.'); }
    return { status: res.status, data };
  }
  const checkPassword = async (email, password) => { const r = await plugin('/auth', { login: email, password }); return r.status === 200 ? Number(r.data.id) : null; };

  /* ── customers ─────────────────────────────────────────────────────── */
  const custCache = new Map();
  async function customer(id, fresh = false) {
    const hit = custCache.get(id);
    if (!fresh && hit && Date.now() - hit.at < 60e3) return hit.c;
    const { data } = await woo.get(`/customers/${id}`);
    custCache.set(id, { c: data, at: Date.now() });
    if (custCache.size > 5000) custCache.delete(custCache.keys().next().value);
    return data;
  }
  const remember = (c) => { custCache.set(c.id, { c, at: Date.now() }); return c; };
  const address = (a = {}, extra = []) => Object.fromEntries([...ADDRESS_KEYS, ...extra].map((k) => [k, a[k] || '']));
  const meView = (c) => ({
    id: c.id, email: c.email, firstName: c.first_name || '', lastName: c.last_name || '', phone: c.billing?.phone || '',
    since: c.date_created, billing: address(c.billing, ['phone']), shipping: address(c.shipping),
  });
  const wishlistOf = (c) => {
    const m = (c.meta_data || []).find((x) => x.key === 'dmd_wishlist');
    let v = m?.value;
    if (typeof v === 'string') { try { v = JSON.parse(v || '[]'); } catch { v = []; } }
    return Array.isArray(v) ? v.map(Number).filter(Boolean) : [];
  };
  const wooMessage = (e, fallback) => {
    const code = e?.code || '';
    if (code.includes('email-exists')) return new HttpError(409, 'An account with this email already exists. Sign in, or reset your password if you forgot it.', 'email_exists');
    if (code.includes('invalid-email')) return new HttpError(400, 'That email address doesn’t look right.');
    if (code.includes('invalid_coupon') || code.includes('coupon')) return new HttpError(409, stripTags(e.message) || 'That coupon can’t be used.', 'coupon_invalid');
    if (code === 'read_only') return new HttpError(503, 'The store is in read-only mode right now. Please try again later.');
    return e instanceof HttpError ? e : new HttpError(e?.status && e.status < 500 ? 400 : 502, fallback);
  };

  /* ── orders ────────────────────────────────────────────────────────── */
  const orderView = (o, notes = []) => ({
    id: o.id, number: o.number, status: o.status, date: o.date_created, total: o.total, shipping: o.shipping_total,
    discount: o.discount_total || '0.00', coupons: (o.coupon_lines || []).map((c) => String(c.code || '').toUpperCase()).filter(Boolean),
    payment: o.payment_method_title, method: o.shipping_lines?.[0]?.method_title || '', note: o.customer_note || '',
    contact: { name: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim(), email: o.billing?.email || '', phone: o.billing?.phone || '' },
    address: address(o.shipping?.address_1 ? o.shipping : o.billing),
    items: (o.line_items || []).map((l) => ({ productId: l.product_id, name: l.name, qty: l.quantity, total: l.total, subtotal: l.subtotal ?? l.total, image: l.image?.src || null })),
    updates: notes.filter((n) => n.customer_note).map((n) => ({ at: n.date_created, text: stripTags(n.note) })).sort((a, b) => a.at.localeCompare(b.at)),
    cancellable: o.status === 'pending',
  });
  async function ownedOrder(id, session) {
    let o;
    try { ({ data: o } = await woo.get(`/orders/${Number(id)}`)); } catch { throw new HttpError(404, 'Order not found.'); }
    if (!session || o.customer_id !== session.customerId || o.status === 'trash') throw new HttpError(404, 'Order not found.'); // never reveal other buyers' orders
    return o;
  }
  /** A guest's order, opened with the private key WooCommerce generated (compared in constant time). */
  async function keyedOrder(id, key, session) {
    let o;
    try { ({ data: o } = await woo.get(`/orders/${Number(id)}`)); } catch { throw new HttpError(404, 'Order not found.'); }
    const given = Buffer.from(String(key || '').slice(0, 64));
    const real = Buffer.from(String(o.order_key || ''));
    const byKey = given.length > 0 && given.length === real.length && timingSafeEqual(given, real);
    const bySession = session && o.customer_id === session.customerId;
    if ((!byKey && !bySession) || o.status === 'trash') throw new HttpError(404, 'Order not found.');
    return o;
  }

  /* ── reviews ───────────────────────────────────────────────────────── */
  const reviewCache = new Map();
  const reviewView = (r) => { const { title, text } = parseReview(r.review); return { id: r.id, productId: r.product_id, product: r.product_name, name: r.reviewer, rating: r.rating, title, text, date: r.date_created, verified: !!r.verified }; };
  const statusOf = (s) => (s === 'approved' ? 'published' : s === 'hold' ? 'pending' : 'hidden');
  const settingsCache = new Map();
  async function settingOn(group, id, fallback) {
    let hit = settingsCache.get(group);
    if (!hit || Date.now() - hit.at > 60e3) {
      try { hit = { at: Date.now(), data: (await woo.get(`/settings/${group}`)).data }; settingsCache.set(group, hit); } catch { return fallback; }
    }
    const v = hit.data.find((s) => s.id === id)?.value;
    return v == null ? fallback : v === 'yes';
  }

  /* ── limits (bounded, so a flood of addresses can't grow them without end) ── */
  const emailFails = limiter(6, 15 * 60e3); // per account
  const ipFails = limiter(30, 15 * 60e3); // per connection (shared networks get some headroom)
  const currentPwFails = limiter(5, 15 * 60e3); // wrong "current password" while signed in, per account
  const registers = limiter(8, 3600e3);
  const resets = limiter(4, 3600e3);
  const orders = limiter(10, 3600e3);
  const quotes = limiter(120, 10 * 60e3);
  const reviews = limiter(10, 3600e3);
  const messages = limiter(30, 3600e3);
  const cancels = limiter(10, 3600e3);
  const alertsAdded = limiter(40, 3600e3);

  const router = createRouter();
  const need = (s) => { if (!s) throw new HttpError(401, 'Please sign in first.', 'signed_out'); return s; };
  /** Checks the signed-in buyer's current password, with its own attempt limit (a stolen session can't guess it). */
  async function confirmCurrentPassword(c, password, customerId) {
    if (!currentPwFails.ok(customerId)) throw new HttpError(429, 'Too many wrong passwords. Please wait 15 minutes, or sign out and reset your password.');
    if (typeof password !== 'string' || !password || password.length > 256 || (await checkPassword(c.email, password)) !== customerId) {
      currentPwFails.add(customerId);
      return false;
    }
    currentPwFails.clear(customerId);
    return true;
  }

  /* ── session ───────────────────────────────────────────────────────── */
  router.get('/session', async ({ session }) => {
    if (!session) return { accounts: accountsOn, buyer: null };
    try { return { accounts: accountsOn, buyer: meView(await customer(session.customerId)) }; } catch { return { accounts: accountsOn, buyer: null }; }
  });

  router.post('/register', async ({ body, ip, res }) => {
    if (!registers.ok(ip)) throw new HttpError(429, 'Too many sign-ups from this connection. Please try again later.');
    if (!accountsOn) throw new HttpError(503, 'Accounts aren’t switched on yet. Please check out as a guest for now.', 'accounts_off');
    const email = clean(body.email, 120).toLowerCase();
    const firstName = clean(body.firstName, 60), lastName = clean(body.lastName, 60), phone = clean(body.phone, 30);
    if (!firstName) throw new HttpError(400, 'Enter your first name.');
    if (!lastName) throw new HttpError(400, 'Enter your last name.');
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) throw new HttpError(400, 'That phone number doesn’t look right.');
    const problem = passwordError(body.password);
    if (problem) throw new HttpError(400, problem, 'weak_password');
    if (body.password !== body.confirm) throw new HttpError(400, 'The two passwords don’t match.', 'mismatch');
    registers.add(ip);
    let c;
    try { ({ data: c } = await woo.post('/customers', { email, first_name: firstName, last_name: lastName, password: body.password, billing: { first_name: firstName, last_name: lastName, email, phone }, shipping: { first_name: firstName, last_name: lastName } })); }
    catch (e) { throw wooMessage(e, 'We couldn’t create your account. Please try again.'); }
    remember(c);
    startSession(res, c.id);
    state.log('customer', `${firstName} ${lastName} created an account`, `#/customers/${c.id}`);
    return { buyer: meView(c) };
  });

  router.post('/login', async ({ body, ip, res }) => {
    const email = clean(body.email, 120).toLowerCase();
    if (!ipFails.ok(ip) || !emailFails.ok(email)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes or reset your password.');
    if (!email || typeof body.password !== 'string' || !body.password || body.password.length > 256) throw new HttpError(400, 'Enter your email and password.');
    const id = await checkPassword(email, String(body.password));
    if (!id) { ipFails.add(ip); emailFails.add(email); throw new HttpError(401, 'That email and password don’t match an account.', 'bad_login'); }
    emailFails.clear(email);
    startSession(res, id);
    return { buyer: meView(await customer(id, true)) };
  });

  router.post('/logout', async ({ session, res }) => {
    if (session) { delete store.sessions[session.key]; persist(); }
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  });

  /* ── password reset (always answers the same, so it can't reveal who has an account) ── */
  router.post('/password/forgot', async ({ body, ip }) => {
    const email = clean(body.email, 120).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (!resets.ok(ip) || !resets.ok(email)) throw new HttpError(429, 'Too many reset requests. Please try again later.');
    resets.add(ip); resets.add(email);
    if (!accountsOn) throw new HttpError(503, 'Accounts aren’t switched on yet.', 'accounts_off');
    const { data: found } = await woo.get('/customers', { email, per_page: 1 });
    const c = found?.[0];
    if (c) {
      for (const [h, v] of Object.entries(store.resets)) if (v.c === c.id) delete store.resets[h];
      const token = randomBytes(32).toString('base64url');
      store.resets[sha(token)] = { c: c.id, exp: Date.now() + RESET_MINUTES * 60e3 };
      persist();
      await plugin('/send-reset', { email: c.email, link: `${storefrontUrl}/account/reset?token=${token}` });
    }
    return { ok: true, message: `If an account uses ${email}, we’ve emailed it a link to choose a new password. The link works for ${RESET_MINUTES} minutes.` };
  });
  router.get('/password/reset', async ({ q }) => { const r = store.resets[sha(String(q.get('token') || '').slice(0, 100))]; return { valid: !!r && r.exp > Date.now() }; });
  router.post('/password/reset', async ({ body, res }) => {
    const key = sha(typeof body.token === 'string' ? body.token.slice(0, 100) : '');
    const r = store.resets[key];
    if (!r || r.exp < Date.now()) throw new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.', 'reset_expired');
    const problem = passwordError(body.password);
    if (problem) throw new HttpError(400, problem, 'weak_password');
    if (body.password !== body.confirm) throw new HttpError(400, 'The two passwords don’t match.', 'mismatch');
    try { await woo.put(`/customers/${r.c}`, { password: body.password }); } catch (e) { throw wooMessage(e, 'We couldn’t change the password. Please try again.'); }
    delete store.resets[key];
    endSessions(r.c);
    startSession(res, r.c);
    return { buyer: meView(await customer(r.c, true)) };
  });

  /* ── the signed-in buyer's own data ────────────────────────────────── */
  router.get('/me', async ({ session }) => meView(await customer(need(session).customerId, true)));
  router.put('/me', async ({ session, body }) => {
    const { customerId } = need(session);
    const c = await customer(customerId, true);
    const patch = {};
    if ('firstName' in body) { patch.first_name = clean(body.firstName, 60); if (!patch.first_name) throw new HttpError(400, 'Enter your first name.'); }
    if ('lastName' in body) { patch.last_name = clean(body.lastName, 60); if (!patch.last_name) throw new HttpError(400, 'Enter your last name.'); }
    const phone = 'phone' in body ? clean(body.phone, 30) : undefined;
    if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) throw new HttpError(400, 'That phone number doesn’t look right.');
    if (body.billing || phone !== undefined) patch.billing = { ...address(body.billing ? obj(body.billing) : c.billing), phone: phone ?? c.billing?.phone ?? '', email: c.email };
    if (body.shipping) patch.shipping = address(obj(body.shipping));
    for (const k of ['billing', 'shipping']) if (patch[k]) for (const f of ADDRESS_KEYS) patch[k][f] = clean(patch[k][f], 120);
    if (body.email !== undefined && clean(body.email, 120).toLowerCase() !== c.email) {
      const email = clean(body.email, 120).toLowerCase();
      if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
      if (!(await confirmCurrentPassword(c, body.currentPassword, customerId))) throw new HttpError(401, 'Enter your current password to change your email.', 'bad_password');
      patch.email = email;
      patch.billing = { ...(patch.billing || address(c.billing, ['phone'])), email };
    }
    let updated;
    try { ({ data: updated } = await woo.put(`/customers/${customerId}`, patch)); } catch (e) { throw wooMessage(e, 'We couldn’t save your details. Please try again.'); }
    return meView(remember(updated));
  });
  router.post('/me/password', async ({ session, body }) => {
    const { customerId, key } = need(session);
    const c = await customer(customerId, true);
    if (!(await confirmCurrentPassword(c, body.current, customerId))) throw new HttpError(401, 'Your current password isn’t right.', 'bad_password');
    const problem = passwordError(body.next);
    if (problem) throw new HttpError(400, problem, 'weak_password');
    if (body.next !== body.confirm) throw new HttpError(400, 'The two new passwords don’t match.', 'mismatch');
    if (body.next === body.current) throw new HttpError(400, 'Choose a password that’s different from your current one.');
    try { await woo.put(`/customers/${customerId}`, { password: body.next }); } catch (e) { throw wooMessage(e, 'We couldn’t change your password. Please try again.'); }
    endSessions(customerId, key); // signs out every other device
    return { ok: true };
  });

  router.get('/me/wishlist', async ({ session }) => ({ ids: wishlistOf(await customer(need(session).customerId)) }));
  router.put('/me/wishlist', async ({ session, body }) => {
    const { customerId } = need(session);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids.slice(0, 500) : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 1e12))].slice(0, 200);
    const { data } = await woo.put(`/customers/${customerId}`, { meta_data: [{ key: 'dmd_wishlist', value: ids }] });
    remember(data);
    return { ids: wishlistOf(data) };
  });

  router.get('/me/orders', async ({ session, q }) => {
    const { customerId } = need(session);
    const page = Math.max(1, Math.min(50, Number(q.get('page')) || 1));
    const res = await woo.get('/orders', { customer: customerId, per_page: 20, page });
    return { items: res.data.filter((o) => o.status !== 'trash' && o.customer_id === customerId).map((o) => orderView(o)), page, pages: Number.isFinite(res.pages) ? res.pages : 1, total: Number.isFinite(res.total) ? res.total : res.data.length };
  });
  router.get('/me/orders/:id', async ({ session, params }) => {
    const o = await ownedOrder(params.id, need(session));
    const { data: notes } = await woo.get(`/orders/${o.id}/notes`);
    return orderView(o, notes);
  });

  /* ── the live catalog (what the storefront lists), built from the product mirror ── */
  let catalogCache = null;
  async function catalog() {
    if (catalogCache && Date.now() - catalogCache.at < 30e3) return catalogCache;
    await idx.syncProducts();
    const [cats, th] = await Promise.all([idx.categories(), idx.stockThresholds()]);
    const rows = [];
    for (const p of idx.products()) {
      if (p.status !== 'publish' || p.catalog_visibility === 'hidden' || (p.type && p.type !== 'simple') || !(Number(p.price) > 0)) continue;
      const level = stockLevel(p, th);
      const created = String(p.date_created || '').slice(0, 10) || null;
      // Exact stock is only shared when it's running low ("Only 2 left"), not the whole inventory.
      rows.push([p.id, p.name, cents(p.price), cents(p.regular_price || p.price), p.categories.map((c) => c.id), p.image || null, level !== 'out', level === 'low' ? p.stock_quantity : null, Number(p.total_sales) || 0, created, p.sku || '', (p.images || []).slice(1, 6)]);
    }
    rows.sort((a, b) => b[8] - a[8] || b[0] - a[0]);
    const data = { at: Date.now(), cats: cats.map((c) => [c.id, c.name, c.slug, c.parent, c.count]), products: rows };
    const body = JSON.stringify(data);
    catalogCache = { at: Date.now(), body, etag: `"${sha(body).slice(0, 32)}"` };
    return catalogCache;
  }
  router.get('/catalog', async ({ req, res }) => {
    const c = await catalog();
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300', ETag: c.etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); return res.end(); }
    const { body, encoding } = compressed(req, `catalog:${c.etag}`, Buffer.from(c.body), 'application/json');
    res.writeHead(200, { ...headers, ...(encoding ? { 'Content-Encoding': encoding } : {}), 'Content-Length': body.length });
    return res.end(body);
  });

  /* ── product details (description and attributes) for the product page, as plain text ── */
  const detailCache = new Map();
  const paragraphs = (html, max) => stripTags(String(html || '').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n').replace(/<li[^>]*>/gi, '• ')).replace(/\n{3,}/g, '\n\n').trim().slice(0, max).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  router.get('/products/:id', async ({ params }) => {
    const id = Number(params.id);
    const hit = detailCache.get(id);
    if (hit && Date.now() - hit.at < 5 * 60e3) return hit.data;
    let p;
    try { ({ data: p } = await woo.get(`/products/${id}`)); } catch { throw new HttpError(404, 'Product not found.'); }
    if (p.status !== 'publish' || p.catalog_visibility === 'hidden') throw new HttpError(404, 'Product not found.');
    const data = {
      id: p.id,
      short: paragraphs(p.short_description, 600).join(' '),
      description: paragraphs(p.description, 6000).slice(0, 30),
      attributes: (p.attributes || []).filter((a) => a.visible !== false && a.name && a.options?.length).slice(0, 20).map((a) => ({ name: plainText(a.name, 60), value: a.options.map((o) => plainText(o, 80)).join(', ').slice(0, 200) })),
      weight: p.weight || null,
      dimensions: p.dimensions && (p.dimensions.length || p.dimensions.width || p.dimensions.height) ? [p.dimensions.length, p.dimensions.width, p.dimensions.height].filter(Boolean).join(' × ') : null,
    };
    detailCache.set(id, { at: Date.now(), data });
    if (detailCache.size > 2000) detailCache.delete(detailCache.keys().next().value);
    return data;
  });

  /* ── pricing: one function for quotes and orders, always from live WooCommerce data ── */
  async function catsOfFn() {
    const all = await idx.categories();
    const parent = new Map(all.map((c) => [c.id, c.parent]));
    return (p) => {
      const out = new Set();
      for (const c of p.categories || []) { let id = c.id, guard = 0; while (id && !out.has(id) && guard++ < 20) { out.add(id); id = parent.get(id); } }
      return [...out];
    };
  }
  /** Validates cart lines against live products. strict=true (orders) throws on the first problem. */
  async function priceLines(items, strict) {
    const raw = (Array.isArray(items) ? items.slice(0, 50) : []).map((i) => ({ id: Number(obj(i).id), qty: Number(obj(i).qty) })).filter((i) => Number.isInteger(i.id) && i.id > 0 && i.id < 1e12);
    if (!raw.length) throw new HttpError(400, 'Your cart is empty.');
    if (raw.length > 30 || raw.some((l) => !(Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_QTY))) throw new HttpError(400, `Each item can be ordered 1–${MAX_QTY} at a time.`);
    const merged = Object.values(raw.reduce((a, l) => { a[l.id] = { id: l.id, qty: (a[l.id]?.qty || 0) + l.qty }; return a; }, {}));
    if (merged.some((l) => l.qty > MAX_QTY)) throw new HttpError(400, `Each item can be ordered 1–${MAX_QTY} at a time.`);
    const { data: products } = await woo.get('/products', { include: merged.map((l) => l.id).join(','), per_page: merged.length });
    const lines = [];
    for (const l of merged) {
      const p = products.find((x) => x.id === l.id);
      let problem = null, code = null;
      if (!p || p.status !== 'publish' || !(Number(p.price) > 0) || p.purchasable === false || (p.type && p.type !== 'simple') || p.catalog_visibility === 'hidden') { problem = `${p?.name || 'An item in your cart'} is no longer available. Please remove it.`; code = 'unavailable'; }
      else if (p.stock_status === 'outofstock') { problem = `${p.name} just sold out. Please remove it.`; code = 'sold_out'; }
      else if (p.manage_stock && p.stock_quantity != null && p.stock_quantity < l.qty) { problem = `Only ${p.stock_quantity} of ${p.name} left. Please lower the quantity.`; code = 'low_stock'; }
      if (problem && strict) throw new HttpError(409, problem, code);
      lines.push({ id: l.id, qty: l.qty, p, name: p?.name || null, price: p ? cents(p.price) : 0, regular: p ? cents(p.regular_price || p.price) : 0, problem, code, max: p?.manage_stock && p.stock_quantity != null ? Math.max(0, Math.min(MAX_QTY, p.stock_quantity)) : MAX_QTY });
    }
    return lines;
  }
  async function findCoupon(code) {
    const { data } = await woo.get('/coupons', { code, per_page: 5 });
    return (data || []).find((c) => String(c.code).toLowerCase() === code) || null;
  }
  const couponCode = (v) => (typeof v === 'string' ? v.trim().toLowerCase().slice(0, 60) : '');

  /** A live quote for the cart: real prices, stock problems per line, and the coupon's discount. */
  router.post('/cart/quote', async ({ body, ip, session }) => {
    if (!quotes.hit(ip)) throw new HttpError(429, 'Too many requests. Please slow down.');
    const lines = await priceLines(body.items, false);
    const ok = lines.filter((l) => !l.problem);
    const subtotal = cents(ok.reduce((a, l) => a + l.price * l.qty, 0));
    const couponsEnabled = await settingOn('general', 'woocommerce_enable_coupons', true);
    let coupon = null, discount = 0;
    const code = couponCode(body.coupon);
    if (code && couponsEnabled) {
      const c = await findCoupon(code).catch(() => null);
      const email = session ? (await customer(session.customerId).catch(() => null))?.email : clean(body.email, 120).toLowerCase();
      const r = couponDiscount(c, ok, { catsOf: await catsOfFn(), email, customerId: session?.customerId });
      coupon = r.problem ? { code: code.toUpperCase(), ok: false, message: r.problem } : { code: code.toUpperCase(), ok: true, discount: r.discount, label: c.discount_type === 'percent' ? `${Number(c.amount)}% off` : `$${money(c.amount)} off` };
      discount = r.discount || 0;
    }
    return {
      lines: lines.map(({ id, qty, name, price, regular, problem, code: why, max }) => ({ id, qty, name, price, regular, problem, code: why, max })),
      subtotal, discount, total: cents(Math.max(0, subtotal - discount)), coupon, couponsEnabled,
      ok: ok.length === lines.length,
    };
  });

  router.get('/checkout-options', async () => {
    let gateways = [];
    try { const { data } = await woo.get('/payment_gateways'); gateways = data.filter((g) => g.enabled && PAYMENTS[g.id]).map((g) => ({ id: g.id, title: g.title || PAYMENTS[g.id], description: stripTags(g.description || '') })); } catch { /* fall back below */ }
    if (!gateways.length) gateways = [{ id: 'cod', title: PAYMENTS.cod, description: 'Pay when your order arrives.' }];
    return { payments: gateways, methods: [{ id: 'delivery', title: 'Delivery', description: 'Cost and timing confirmed by DMD after you order' }, { id: 'pickup', title: 'Pick up', description: 'Collect from the store' }], coupons: await settingOn('general', 'woocommerce_enable_coupons', true) };
  });

  /* ── checkout (guests too); prices, stock and totals always come from WooCommerce ── */
  // A retried "Place order" (double tap, flaky network) with the same key gets the first order back, never a second one.
  const placed = new Map();
  const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,64}$/;
  router.post('/orders', async ({ session, body, ip }) => {
    const key = typeof body.idempotencyKey === 'string' && IDEMPOTENCY.test(body.idempotencyKey) ? `${session?.customerId || 'guest'}:${body.idempotencyKey}` : null;
    if (key && placed.has(key)) return placed.get(key).promise;
    const work = placeOrder({ session, body, ip });
    if (!key) return work;
    if (placed.size > 5000) placed.delete(placed.keys().next().value);
    placed.set(key, { at: Date.now(), promise: work });
    work.catch(() => placed.delete(key)); // a failed attempt can be tried again with the same key
    return work;
  });
  setInterval(() => { const t = Date.now(); for (const [k, v] of placed) if (t - v.at > 30 * 60e3) placed.delete(k); }, 5 * 60e3).unref();

  async function placeOrder({ session, body, ip }) {
    if (!orders.ok(ip)) throw new HttpError(429, 'Too many orders from this connection. Please wait a little and try again.');
    const c = obj(body.contact);
    const contact = { first_name: clean(c.firstName, 60), last_name: clean(c.lastName, 60), email: clean(c.email, 120).toLowerCase(), phone: clean(c.phone, 30) };
    const errors = {};
    if (!contact.first_name) errors.firstName = 'Enter your first name';
    if (!contact.last_name) errors.lastName = 'Enter your last name';
    if (!isEmail(contact.email)) errors.email = 'Enter a valid email address';
    if (!/^[+\d][\d\s().-]{5,}$/.test(contact.phone)) errors.phone = 'Enter a phone number DMD can call';
    const method = body.method === 'pickup' ? 'pickup' : 'delivery';
    const addr = address(obj(body.address));
    for (const k of ADDRESS_KEYS) addr[k] = clean(addr[k], 120);
    addr.country = (addr.country || 'LB').toUpperCase().slice(0, 2);
    if (method === 'delivery') { if (!addr.address_1) errors.address_1 = 'Enter your street address'; if (!addr.city) errors.city = 'Enter your city'; }
    const payment = PAYMENTS[body.payment] ? body.payment : 'cod';
    // Cart shape problems first (empty, quantities), then the contact form, then live availability.
    const lines = await priceLines(body.items, false);
    if (Object.keys(errors).length) throw Object.assign(new HttpError(400, 'Please check the highlighted fields.', 'invalid'), { fields: errors });
    const bad = lines.find((l) => l.problem);
    if (bad) throw new HttpError(409, bad.problem, bad.code);
    const code = couponCode(body.coupon);
    if (code) {
      if (!(await settingOn('general', 'woocommerce_enable_coupons', true))) throw new HttpError(409, 'Coupons aren’t accepted right now.', 'coupon_invalid');
      const r = couponDiscount(await findCoupon(code).catch(() => null), lines, { catsOf: await catsOfFn(), email: contact.email, customerId: session?.customerId });
      if (r.problem) throw new HttpError(409, r.problem, 'coupon_invalid');
    }
    orders.add(ip);
    const name = { first_name: contact.first_name, last_name: contact.last_name };
    let o;
    try {
      ({ data: o } = await woo.post('/orders', {
        status: 'pending', set_paid: false, customer_id: session?.customerId || 0,
        payment_method: payment, payment_method_title: PAYMENTS[payment],
        billing: { ...address(method === 'delivery' ? addr : {}), ...name, email: contact.email, phone: contact.phone, country: addr.country },
        shipping: method === 'delivery' ? { ...addr, ...name } : { ...address({}), ...name },
        line_items: lines.map((l) => ({ product_id: l.id, quantity: l.qty })),
        shipping_lines: [{ method_id: method === 'pickup' ? 'local_pickup' : 'flat_rate', method_title: method === 'pickup' ? 'Pick up from store' : 'Delivery', total: '0.00' }],
        ...(code ? { coupon_lines: [{ code }] } : {}),
        customer_note: plainText(cleanText(body.note, 1000), 1000), // tags removed, as WooCommerce's own checkout does
      }));
    } catch (e) { throw wooMessage(e, 'We couldn’t place your order. Nothing was charged. Please try again.'); }
    idx.putOrder(o);
    if (session && body.saveAddress && method === 'delivery') woo.put(`/customers/${session.customerId}`, { billing: { ...addr, ...name, email: contact.email, phone: contact.phone }, shipping: { ...addr, ...name } }).then(({ data }) => remember(data)).catch(() => {});
    state.log('order', `New storefront order #${o.number} from ${contact.first_name} ${contact.last_name} · $${o.total}${code ? ` · coupon ${code.toUpperCase()}` : ''}`, `#/orders/${o.id}`);
    return { id: o.id, number: o.number, key: session ? null : o.order_key, total: o.total };
  }
  // A guest can open their own confirmation with the order key WooCommerce generated; buyers by session.
  router.get('/orders/:id', async ({ session, params, q }) => orderView(await keyedOrder(params.id, q.get('key'), session)));

  /** Buyers (and guests with their key) can cancel an order DMD hasn't confirmed yet. */
  router.post('/orders/:id/cancel', async ({ session, params, body, ip }) => {
    if (!cancels.hit(session?.customerId || ip)) throw new HttpError(429, 'Too many requests. Please wait a little.');
    const o = await keyedOrder(params.id, body.key, session);
    if (o.status !== 'pending') throw new HttpError(409, o.status === 'cancelled' ? 'This order is already cancelled.' : 'DMD has already confirmed this order. Message or call DMD to change it.', 'not_cancellable');
    const reason = plainText(cleanText(body.reason, 300), 300);
    let updated;
    try { ({ data: updated } = await woo.put(`/orders/${o.id}`, { status: 'cancelled' })); } catch (e) { throw wooMessage(e, 'We couldn’t cancel the order. Please try again or call DMD.'); }
    await woo.post(`/orders/${o.id}/notes`, { note: `${BUYER_TAG}Cancelled by the buyer from the storefront.${reason ? ` Reason: ${escapeHtml(reason)}` : ''}`, customer_note: false }).catch(() => {});
    idx.putOrder(updated);
    state.update((st) => { (st.buyerMessages ||= {})[o.id] = { at: new Date().toISOString(), text: `Cancelled the order${reason ? `: ${reason.slice(0, 100)}` : ''}` }; });
    state.log('order', `${o.billing?.first_name || 'A buyer'} cancelled order #${o.number} from the storefront`, `#/orders/${o.id}`);
    return orderView(updated);
  });

  /* ── reviews ───────────────────────────────────────────────────────── */
  // Computed from the approved reviews themselves: approving a review doesn't change a product's modified date,
  // so the product mirror can't be trusted to notice new ratings quickly.
  let ratingsCache = null;
  router.get('/ratings', async () => {
    if (ratingsCache && Date.now() - ratingsCache.at < 60e3) return ratingsCache.data;
    const all = await woo.all('/products/reviews', { status: 'approved' }, 50);
    const agg = {};
    for (const r of all) { const a = (agg[r.product_id] ||= [0, 0]); a[0] += Number(r.rating) || 0; a[1]++; }
    const data = Object.fromEntries(Object.entries(agg).map(([id, [sum, n]]) => [id, [Math.round((sum / n) * 100) / 100, n]]));
    ratingsCache = { at: Date.now(), data };
    return data;
  });
  router.get('/products/:id/reviews', async ({ params }) => {
    const id = Number(params.id);
    const hit = reviewCache.get(id);
    if (hit && Date.now() - hit.at < 20e3) return hit.data;
    const all = await woo.all('/products/reviews', { product: id, status: 'approved' }, 10);
    const items = all.filter((r) => r.product_id === id).map(reviewView);
    const count = items.length;
    const avg = count ? items.reduce((a, r) => a + r.rating, 0) / count : 0;
    const out = { average: Math.round(avg * 10) / 10, count, verified: items.filter((r) => r.verified).length, breakdown: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: items.filter((r) => r.rating === s).length })), items };
    reviewCache.set(id, { at: Date.now(), data: out });
    if (reviewCache.size > 2000) reviewCache.delete(reviewCache.keys().next().value);
    return out;
  });
  router.get('/me/reviews', async ({ session, q }) => {
    const c = await customer(need(session).customerId);
    const product = Number(q.get('product'));
    const { data } = await woo.get('/products/reviews', { reviewer_email: c.email, status: 'all', per_page: 100, ...(Number.isInteger(product) && product > 0 ? { product } : {}) });
    return { items: data.filter((r) => r.reviewer_email?.toLowerCase() === c.email.toLowerCase()).map((r) => ({ ...reviewView(r), status: statusOf(r.status) })) };
  });
  const reviewing = new Set();
  router.post('/me/reviews', async ({ session, body }) => {
    const { customerId } = need(session);
    const lock = `${customerId}:${Number(body.productId)}`;
    if (reviewing.has(lock)) throw new HttpError(409, 'Your review is already being sent.', 'in_flight');
    reviewing.add(lock);
    try { return await submitReview(customerId, body); } finally { reviewing.delete(lock); }
  });
  async function submitReview(customerId, body) {
    if (!reviews.ok(customerId)) throw new HttpError(429, 'You’ve sent a lot of reviews in a short time. Please try again later.');
    const productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId < 1) throw new HttpError(400, 'Choose a product.');
    const rating = Number(body.rating);
    const title = cleanText(body.title, 120).replace(/\n+/g, ' ');
    const text = cleanText(body.text, 5000);
    if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new HttpError(400, 'Choose a rating from 1 to 5 stars.');
    if (title.length < 3) throw new HttpError(400, 'Give your review a short title.');
    if (text.length < 10) throw new HttpError(400, 'Write at least a sentence (10 characters or more).');
    if (!(await settingOn('products', 'woocommerce_enable_reviews', true))) throw new HttpError(403, 'Reviews are switched off for this store.');
    const c = await customer(customerId, true);
    let product;
    try { ({ data: product } = await woo.get(`/products/${productId}`)); } catch { throw new HttpError(404, 'Product not found.'); }
    if (product.status !== 'publish') throw new HttpError(404, 'Product not found.');
    const { data: mine } = await woo.get('/products/reviews', { reviewer_email: c.email, product: productId, status: 'all', per_page: 5 });
    if (mine.some((r) => r.reviewer_email?.toLowerCase() === c.email.toLowerCase() && r.product_id === productId)) throw new HttpError(409, 'You’ve already reviewed this product. Thanks!', 'already_reviewed');
    if (await settingOn('products', 'woocommerce_review_rating_verification_required', false)) {
      const { data: os } = await woo.get('/orders', { customer: customerId, per_page: 100 });
      if (!os.some((o) => PAID.has(o.status) && o.line_items.some((l) => l.product_id === productId))) throw new HttpError(403, 'Only buyers who received this product can review it.', 'not_verified');
    }
    reviews.add(customerId);
    const name = plainText(`${c.first_name || 'DMD'} ${c.last_name ? `${[...c.last_name][0]}.` : 'buyer'}`, 80);
    let r;
    try { ({ data: r } = await woo.post('/products/reviews', { product_id: productId, status: 'hold', reviewer: name, reviewer_email: c.email, rating, review: `<strong>${escapeHtml(title)}</strong>\n\n${escapeHtml(text)}` })); }
    catch (e) { throw wooMessage(e, 'We couldn’t send your review. Please try again.'); }
    bustReviews();
    state.log('review', `${name} reviewed ${product.name} (${rating}★), waiting for approval`, '#/reviews?status=hold');
    return { ...reviewView(r), status: statusOf(r.status) };
  }

  /* ── messages with the store, per order ───────────────────────────── */
  router.get('/me/messages', async ({ session }) => {
    const { customerId } = need(session);
    const { data } = await woo.get('/orders', { customer: customerId, per_page: 30 });
    const st = state.get();
    return {
      items: data.filter((o) => o.status !== 'trash' && o.customer_id === customerId).map((o) => {
        const fromBuyer = st.buyerMessages?.[o.id];
        const fromOwner = st.ownerReplies?.[o.id];
        const seen = store.reads[`${customerId}:${o.id}`];
        return { orderId: o.id, number: o.number, status: o.status, date: o.date_created, hasThread: !!(o.customer_note || fromBuyer || fromOwner), unread: !!fromOwner && (!seen || fromOwner > seen), last: [fromBuyer?.at, fromOwner, o.customer_note ? o.date_created : null].filter(Boolean).sort().pop() || null };
      }),
    };
  });
  router.get('/me/messages/:id', async ({ session, params }) => {
    const s = need(session);
    const o = await ownedOrder(params.id, s);
    const { data: notes } = await woo.get(`/orders/${o.id}/notes`);
    const thread = [];
    if (o.customer_note) thread.push({ id: 'checkout', from: 'you', text: o.customer_note, at: o.date_created });
    for (const n of notes) {
      if (n.customer_note) thread.push({ id: n.id, from: 'store', text: stripTags(n.note), at: n.date_created });
      else if (String(n.note).startsWith(BUYER_TAG)) thread.push({ id: n.id, from: 'you', text: stripTags(n.note).slice(BUYER_TAG.length), at: n.date_created });
    }
    thread.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    store.reads[`${s.customerId}:${o.id}`] = new Date().toISOString(); persist();
    return { order: orderView(o), thread };
  });
  router.post('/me/messages/:id', async ({ session, params, body }) => {
    const s = need(session);
    if (!messages.ok(s.customerId)) throw new HttpError(429, 'You’ve sent a lot of messages. Please wait a little.');
    const text = cleanText(body.text, 2000);
    if (text.length < 2) throw new HttpError(400, 'Write a message first.');
    const o = await ownedOrder(params.id, s);
    messages.add(s.customerId);
    const { data: n } = await woo.post(`/orders/${o.id}/notes`, { note: `${BUYER_TAG}${escapeHtml(text)}`, customer_note: false });
    const at = new Date().toISOString();
    state.update((st) => { (st.buyerMessages ||= {})[o.id] = { at, text: text.slice(0, 140) }; });
    state.log('message', `${o.billing?.first_name || 'A buyer'} wrote about order #${o.number}`, `#/messages/${o.id}`);
    return { id: n.id, from: 'you', text, at: n.date_created };
  });

  /* ── back-in-stock alerts: signed-in buyers ask to be emailed when a sold-out product returns ── */
  const alertList = (customerId) => Object.entries(store.alerts).filter(([, who]) => who[customerId]).map(([pid, who]) => ({ productId: Number(pid), since: who[customerId] }));
  router.get('/me/alerts', async ({ session }) => ({ items: alertList(need(session).customerId) }));
  router.post('/me/alerts', async ({ session, body }) => {
    const { customerId } = need(session);
    const productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId < 1) throw new HttpError(400, 'Choose a product.');
    if (!alertsAdded.hit(customerId)) throw new HttpError(429, 'Too many requests. Please wait a little.');
    if (alertList(customerId).length >= 50) throw new HttpError(400, 'You can follow up to 50 products. Remove one first.');
    await idx.syncProducts();
    const p = idx.product(productId);
    if (!p || p.status !== 'publish') throw new HttpError(404, 'Product not found.');
    (store.alerts[productId] ||= {})[customerId] = new Date().toISOString();
    persist();
    return { items: alertList(customerId) };
  });
  router.del('/me/alerts/:id', async ({ session, params }) => {
    const { customerId } = need(session);
    const who = store.alerts[Number(params.id)];
    if (who) { delete who[customerId]; if (!Object.keys(who).length) delete store.alerts[Number(params.id)]; persist(); }
    return { items: alertList(customerId) };
  });
  /** Emails everyone waiting on products that are back in stock (through the WordPress plugin), then forgets them. */
  let alerting = false;
  async function sendStockAlerts() {
    if (alerting || !accountsOn || !Object.keys(store.alerts).length) return;
    alerting = true;
    try {
      await idx.syncProducts();
      const th = await idx.stockThresholds();
      for (const [pid, who] of Object.entries(store.alerts)) {
        const p = idx.product(Number(pid));
        if (!p) { delete store.alerts[pid]; continue; }
        if (p.status !== 'publish' || stockLevel(p, th) === 'out') continue;
        for (const customerId of Object.keys(who)) {
          try {
            await plugin('/notify-stock', { customer_id: Number(customerId), product_id: p.id, link: `${storefrontUrl}/product/${p.id}` });
            delete who[customerId];
          } catch (e) { log?.(`Back-in-stock email for product ${p.id} failed: ${e.message}`); }
        }
        if (!Object.keys(who).length) { delete store.alerts[pid]; state.log('stock', `Emailed buyers that ${p.name} is back in stock`, `#/inventory?focus=${p.id}`); }
      }
      persist();
    } catch (e) { log?.(`Back-in-stock check failed: ${e.message}`); }
    finally { alerting = false; }
  }
  setInterval(sendStockAlerts, 2 * 60e3).unref();

  /** Called whenever reviews change (here or in /admin) so ratings and product reviews are fresh. */
  function bustReviews() { ratingsCache = null; reviewCache.clear(); }
  /** Called when the owner changes products, so the storefront catalog and quotes don't wait for the cache. */
  function bustCatalog() { catalogCache = null; detailCache.clear(); }
  const waiting = (productId) => Object.keys(store.alerts[productId] || {}).length;
  return { router, sessionOf, accountsOn, bustReviews, bustCatalog, sendStockAlerts, waiting, flush, catalog };
}
