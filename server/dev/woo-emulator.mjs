// LOCAL TEST EMULATOR — NOT YOUR STORE.
// A small stand-in for the WooCommerce REST API (wc/v3) so the admin can be built and tested without touching
// dmdworld.store. Catalog and categories are seeded from the storefront's snapshot (read-only import); buyers,
// orders, reviews and coupons are generated test data. Everything lives in dev/emulator-data.json.
// Run: node server/dev/woo-emulator.mjs   (port 8899, keys from server/.env: EMU_KEY / EMU_SECRET)
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import { hashPassword, verifyPassword } from '../lib/auth.mjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv(process.env.DMD_ENV_FILE || join(HERE, '..', '.env'));
const PORT = Number(process.env.EMU_PORT || 8899);
const KEY = process.env.EMU_KEY;
const SECRET = process.env.EMU_SECRET;
if (!KEY || !SECRET) { console.error('Set EMU_KEY and EMU_SECRET in server/.env'); process.exit(1); }
const DATA = process.env.EMU_DATA || join(HERE, 'emulator-data.json');
const OUTBOX = process.env.EMU_OUTBOX || join(HERE, 'outbox');
const PLUGIN_SECRET = process.env.DMD_AUTH_SECRET || '';
const STOREFRONT_URL = (process.env.STOREFRONT_URL || 'http://localhost:5173').replace(/\/$/, '');
const IMG = 'https://dmdworld.store/wp-content/uploads/';

/* ── helpers ─────────────────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const gmtISO = (d) => d.toISOString().slice(0, 19);
const now = () => new Date();
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ── seed ────────────────────────────────────────────────────────────── */
async function seed() {
  const { CATS, PRODUCTS_RAW } = await import('../../src/data/dmdCatalog.js');
  const r = rng(4242);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const T = Date.now();
  const DAY = 864e5;

  const categories = CATS.map(([id, name, slug, parent], i) => ({ id, name, slug, parent, description: '', display: 'default', image: null, menu_order: i, count: 0 }));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const products = PRODUCTS_RAW.map(([id, name, price, regular, cats, img, inStock], i) => {
    const out = !inStock;
    const low = !out && r() < 0.14;
    const qty = out ? 0 : low ? 1 + Math.floor(r() * 4) : 5 + Math.floor(r() * 36);
    const m = (img || '').match(/^(\d{4})\/(\d{2})/);
    const created = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1 + Math.floor(r() * 27), 10 + Math.floor(r() * 8)) : new Date(T - 400 * DAY);
    return {
      id, name, slug: slugify(name), permalink: `https://emulator.local/product/${slugify(name)}/`, type: 'simple', status: 'publish', featured: r() < 0.06,
      catalog_visibility: 'visible', description: '', short_description: '', sku: r() < 0.6 ? `DMD-${id}` : '',
      price: String(price), regular_price: String(regular), sale_price: price < regular ? String(price) : '', on_sale: price < regular,
      date_on_sale_from: null, date_on_sale_to: null, total_sales: Math.floor(r() * 120), manage_stock: true, stock_quantity: qty,
      stock_status: qty > 0 ? 'instock' : 'outofstock', low_stock_amount: null,
      categories: cats.map((c) => catById[c]).filter(Boolean).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      tags: [], brands: [], images: img ? [{ id: 900000 + i, src: IMG + img, name: name, alt: '' }] : [],
      date_created: localISO(created), date_created_gmt: gmtISO(created), date_modified: localISO(created), date_modified_gmt: gmtISO(created),
    };
  });

  const FIRST = ['Karim', 'Maya', 'Rami', 'Lea', 'Hadi', 'Nour', 'Jad', 'Yara', 'Omar', 'Sara', 'Tarek', 'Lara', 'Fadi', 'Dana', 'Ziad', 'Mira', 'Elie', 'Joelle', 'Hassan', 'Rita', 'Bilal', 'Perla', 'Samir', 'Hiba', 'Georges', 'Nadine', 'Wael', 'Rana'];
  const LAST = ['Haddad', 'Khoury', 'Saleh', 'Nassar', 'Fares', 'Mansour', 'Aoun', 'Chamoun', 'Hamdan', 'Rizk', 'Sayegh', 'Daher', 'Karam', 'Youssef', 'Azar'];
  const CITIES = ['Beirut', 'Jounieh', 'Tripoli', 'Saida', 'Byblos', 'Zahle', 'Batroun', 'Tyre', 'Baabda', 'Aley'];
  const STREETS = ['Hamra St', 'Bliss St', 'Mar Elias St', 'Main Rd', 'Charles Helou Ave', 'Verdun St', 'Old Souk Rd', 'Seaside Rd'];
  const addr = (f, l, email, city) => ({ first_name: f, last_name: l, company: '', address_1: `${10 + Math.floor(r() * 180)} ${pick(STREETS)}`, address_2: r() < 0.3 ? `Building ${1 + Math.floor(r() * 30)}, floor ${1 + Math.floor(r() * 9)}` : '', city, state: '', postcode: '', country: 'LB', email, phone: `+961 ${pick(['3', '70', '71', '76', '78', '81'])} ${100 + Math.floor(r() * 899)} ${100 + Math.floor(r() * 899)}` });

  const customers = Array.from({ length: 52 }, (_, i) => {
    const f = pick(FIRST), l = pick(LAST);
    const email = `${f}.${l}${i}@example.com`.toLowerCase();
    const city = pick(CITIES);
    const created = new Date(T - Math.floor(r() * 160) * DAY - Math.floor(r() * DAY));
    const a = addr(f, l, email, city);
    return { id: 2001 + i, email, first_name: f, last_name: l, username: `${f}${l}${i}`.toLowerCase(), role: 'customer', date_created: localISO(created), date_created_gmt: gmtISO(created), date_modified: localISO(created), billing: a, shipping: { ...a, email: undefined, phone: undefined }, is_paying_customer: false, avatar_url: '' };
  }).sort((a, b) => a.date_created.localeCompare(b.date_created));

  const weights = products.map((p) => (1 / (1 + Number(p.price) / 40)) * (p.on_sale ? 1.5 : 1) * (0.4 + r()));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const pickProduct = () => { let x = r() * totalW; for (let i = 0; i < products.length; i++) { x -= weights[i]; if (x <= 0) return products[i]; } return products[0]; };
  const NOTES = ['Please call before delivery.', 'Is this compatible with the PS5 slim?', 'Can you deliver after 6pm?', 'Gift — please don’t include the invoice.', 'Do you have this in white?', 'I’ll pick it up from the store if that’s easier.', 'Please double-check it’s the Arabic version.'];

  const orders = [];
  const notes = {};
  let oid = 50001, nid = 1;
  for (let d = 150; d >= 0; d--) {
    const day = new Date(T - d * DAY); day.setHours(0, 0, 0, 0);
    const wk = [5, 6, 0].includes(day.getDay()) ? 1.3 : 1;
    const n = Math.round((1.4 + (150 - d) / 150 * 1.6) * wk * (0.5 + r()));
    for (let k = 0; k < n; k++) {
      const t = new Date(day.getTime() + (9 + r() * 14) * 3600e3);
      if (t.getTime() > T) continue;
      const ageH = (T - t.getTime()) / 3600e3;
      const reg = customers.filter((c) => new Date(c.date_created).getTime() < t.getTime());
      const guest = r() < 0.3 || !reg.length;
      const c = guest ? null : pick(reg);
      const f = c ? c.first_name : pick(FIRST), l = c ? c.last_name : pick(LAST);
      const email = c ? c.email : `${f}.${l}.guest${oid}@example.com`.toLowerCase();
      const billing = c ? { ...c.billing } : addr(f, l, email, pick(CITIES));
      const lines = [];
      const count = r() < 0.62 ? 1 : r() < 0.8 ? 2 : 3;
      for (let j = 0; j < count; j++) {
        const p = pickProduct();
        if (lines.some((x) => x.product_id === p.id)) continue;
        const q = r() < 0.86 ? 1 : 2;
        const unit = Number(p.price);
        lines.push({ id: oid * 10 + j, name: p.name, product_id: p.id, variation_id: 0, quantity: q, subtotal: money(unit * q), total: money(unit * q), sku: p.sku, price: unit, image: p.images[0] ? { id: p.images[0].id, src: p.images[0].src } : { id: '', src: '' } });
      }
      const ship = billing.city === 'Beirut' ? 3 : 5;
      let status = 'completed';
      if (ageH < 10) status = r() < 0.7 ? 'pending' : 'processing';
      else if (ageH < 36) status = r() < 0.45 ? 'pending' : r() < 0.85 ? 'processing' : 'on-hold';
      else if (ageH < 96) status = r() < 0.65 ? 'processing' : 'completed';
      if (r() < 0.045) status = 'cancelled';
      const items = lines.reduce((a, x) => a + Number(x.total), 0);
      const pay = r() < 0.82 ? ['cod', 'Cash on delivery'] : ['bacs', 'Direct bank transfer'];
      const o = {
        id: oid, number: String(oid), status, currency: 'USD', prices_include_tax: false,
        date_created: localISO(t), date_created_gmt: gmtISO(t), date_modified: localISO(t), date_modified_gmt: gmtISO(t),
        date_paid: status === 'completed' ? localISO(new Date(t.getTime() + 2 * DAY)) : null, date_completed: status === 'completed' ? localISO(new Date(t.getTime() + 2 * DAY)) : null,
        discount_total: '0.00', shipping_total: money(ship), total_tax: '0.00', total: money(items + ship), customer_id: c ? c.id : 0,
        customer_note: r() < 0.11 ? pick(NOTES) : '', billing, shipping: { ...billing, email: undefined, phone: undefined },
        payment_method: pay[0], payment_method_title: pay[1], transaction_id: '', customer_ip_address: '', created_via: 'checkout',
        line_items: lines, shipping_lines: [{ id: oid * 10 + 9, method_id: 'flat_rate', method_title: 'Delivery', total: money(ship) }], fee_lines: [], coupon_lines: [], refunds: [],
      };
      orders.push(o);
      if (c && status !== 'cancelled') c.is_paying_customer = true;
      notes[oid] = status === 'pending' ? [] : [{ id: nid++, author: 'system', date_created: localISO(new Date(t.getTime() + 600e3)), date_created_gmt: gmtISO(new Date(t.getTime() + 600e3)), note: `Order status changed from Pending payment to ${status === 'on-hold' ? 'On hold' : status === 'cancelled' ? 'Cancelled' : 'Processing'}.`, customer_note: false }];
      oid++;
    }
  }

  const REVIEWS = { 5: ['Exactly as described, works perfectly.', 'Great quality for the price. Would buy again.', 'Original product and very well packed.'], 4: ['Good product, delivery took a day longer than expected.', 'Works well, the cable is a bit short.'], 3: ['Okay for the price, nothing special.', 'Does the job but feels a bit cheap.'], 2: ['The box was damaged when it arrived.', 'Not compatible with my console, should have been clearer.'], 1: ['Stopped working after a week.'] };
  const reviews = Array.from({ length: 38 }, (_, i) => {
    const o = orders[orders.length - 1 - Math.floor(r() * Math.min(orders.length, 160))];
    const line = o.line_items[0];
    const rating = r() < 0.55 ? 5 : r() < 0.75 ? 4 : r() < 0.85 ? 3 : r() < 0.95 ? 2 : 1;
    const t = new Date(new Date(o.date_created).getTime() + (1 + r() * 6) * DAY);
    return { id: 7001 + i, date_created: localISO(t), date_created_gmt: gmtISO(t), product_id: line.product_id, product_name: line.name, product_permalink: '', status: r() < 0.22 || rating <= 2 ? 'hold' : 'approved', reviewer: `${o.billing.first_name} ${o.billing.last_name[0]}.`, reviewer_email: o.billing.email, review: `<p>${pick(REVIEWS[rating])}</p>`, rating, verified: true };
  }).filter((x) => new Date(x.date_created).getTime() < T).sort((a, b) => b.date_created.localeCompare(a.date_created));

  const coupons = [
    { id: 8001, code: 'welcome10', amount: '10.00', status: 'publish', discount_type: 'percent', description: 'First order, 10% off', date_expires: null, usage_count: 14, individual_use: true, product_ids: [], excluded_product_ids: [], usage_limit: null, usage_limit_per_user: 1, free_shipping: false, product_categories: [], excluded_product_categories: [], minimum_amount: '20.00', maximum_amount: '0.00', date_created: localISO(new Date(T - 60 * DAY)) },
    { id: 8002, code: 'ps4games5', amount: '5.00', status: 'publish', discount_type: 'fixed_cart', description: '$5 off PS4 games', date_expires: localISO(new Date(T + 9 * DAY)), usage_count: 6, individual_use: false, product_ids: [], excluded_product_ids: [], usage_limit: 100, usage_limit_per_user: null, free_shipping: false, product_categories: [336], excluded_product_categories: [], minimum_amount: '0.00', maximum_amount: '0.00', date_created: localISO(new Date(T - 12 * DAY)) },
  ];

  const settings = {
    general: [
      { id: 'woocommerce_store_address', label: 'Address line 1', type: 'text', value: 'Hamra Street', default: '' },
      { id: 'woocommerce_store_address_2', label: 'Address line 2', type: 'text', value: '', default: '' },
      { id: 'woocommerce_store_city', label: 'City', type: 'text', value: 'Beirut', default: '' },
      { id: 'woocommerce_default_country', label: 'Country / State', type: 'select', value: 'LB', default: 'US:CA' },
      { id: 'woocommerce_store_postcode', label: 'Postcode / ZIP', type: 'text', value: '', default: '' },
      { id: 'woocommerce_currency', label: 'Currency', type: 'select', value: 'USD', default: 'USD' },
      { id: 'woocommerce_price_num_decimals', label: 'Number of decimals', type: 'number', value: '2', default: '2' },
      { id: 'woocommerce_calc_taxes', label: 'Enable taxes', type: 'checkbox', value: 'no', default: 'no' },
      { id: 'woocommerce_enable_coupons', label: 'Enable coupons', type: 'checkbox', value: 'yes', default: 'yes' },
    ],
    products: [
      { id: 'woocommerce_manage_stock', label: 'Manage stock', type: 'checkbox', value: 'yes', default: 'yes' },
      { id: 'woocommerce_notify_low_stock_amount', label: 'Low stock threshold', type: 'number', value: '4', default: '2' },
      { id: 'woocommerce_notify_no_stock_amount', label: 'Out of stock threshold', type: 'number', value: '0', default: '0' },
      { id: 'woocommerce_hide_out_of_stock_items', label: 'Hide out of stock items from the catalog', type: 'checkbox', value: 'no', default: 'no' },
      { id: 'woocommerce_enable_reviews', label: 'Enable product reviews', type: 'checkbox', value: 'yes', default: 'yes' },
      { id: 'woocommerce_review_rating_verification_required', label: 'Reviews can only be left by verified owners', type: 'checkbox', value: 'no', default: 'no' },
    ],
  };

  const db = { meta: { seeded: localISO(now()) }, categories, products, customers, orders, notes, reviews, coupons, settings, seq: { product: 60000, category: 2000, note: nid, coupon: 8100, image: 990000 } };
  recount(db);
  return db;
}

function recount(db) {
  const counts = {};
  for (const p of db.products) if (p.status === 'publish') for (const c of p.categories) counts[c.id] = (counts[c.id] || 0) + 1;
  for (const c of db.categories) c.count = counts[c.id] || 0;
}

let db = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : await seed();
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeFileSync(DATA, JSON.stringify(db)), 250); };

/* ── what real WooCommerce does that the admin-only emulator skipped ───── */
const PAID = new Set(['processing', 'completed']); // wc_get_is_paid_statuses()
const orderKey = () => `wc_order_${randomBytes(7).toString('hex')}`;
for (const o of db.orders) { o.order_key ||= orderKey(); o.created_via ||= 'checkout'; if (o._stock_reduced == null) o._stock_reduced = o.status !== 'pending' && o.status !== 'cancelled'; }
for (const c of db.customers) { c.meta_data ||= []; c.role ||= 'customer'; }
db.seq.customer ||= Math.max(2000, ...db.customers.map((c) => c.id));
db.seq.order ||= Math.max(50000, ...db.orders.map((o) => o.id));
db.seq.review ||= Math.max(7000, ...db.reviews.map((v) => v.id));
const pubCustomer = ({ _pw, ...c }) => c; // the password hash never leaves the emulator, as in WordPress
const pubOrder = ({ _stock_reduced, ...o }) => o;
/** wc_customer_bought_product(): a paid order by this email or customer containing the product. */
const boughtProduct = (email, customerId, productId) => db.orders.some((o) => PAID.has(o.status)
  && ((customerId && o.customer_id === customerId) || (email && o.billing?.email?.toLowerCase() === email.toLowerCase()))
  && o.line_items.some((l) => l.product_id === productId));
/** Products carry average_rating / rating_count from their approved reviews, like WooCommerce. */
function rerate() {
  const agg = {};
  for (const v of db.reviews) if (v.status === 'approved') { const a = (agg[v.product_id] ||= { sum: 0, n: 0 }); a.sum += v.rating; a.n++; }
  for (const p of db.products) { const a = agg[p.id]; p.average_rating = a ? (a.sum / a.n).toFixed(2) : '0.00'; p.rating_count = a ? a.n : 0; }
}
/** Stock moves when an order is paid or held (and comes back if it is cancelled), as WooCommerce does. */
function moveStock(o, sign) {
  for (const l of o.line_items) {
    const p = db.products.find((x) => x.id === l.product_id);
    if (p && p.manage_stock) { p.stock_quantity = Math.max(0, Number(p.stock_quantity || 0) + sign * l.quantity); p.stock_status = p.stock_quantity > 0 ? 'instock' : 'outofstock'; if (sign < 0) p.total_sales = (p.total_sales || 0) + l.quantity; }
  }
}
/** Coupon usage is counted when an order is paid or held and given back if it is cancelled, as WooCommerce does. */
function countCoupons(o, sign) {
  for (const cl of o.coupon_lines || []) {
    const c = db.coupons.find((x) => x.code === String(cl.code).toLowerCase());
    if (!c) continue;
    c.usage_count = Math.max(0, Number(c.usage_count || 0) + sign);
    c.used_by ||= [];
    const who = o.customer_id ? String(o.customer_id) : String(o.billing?.email || '').toLowerCase();
    if (sign > 0) c.used_by.push(who); else { const i = c.used_by.lastIndexOf(who); if (i >= 0) c.used_by.splice(i, 1); }
  }
}
function syncStock(o) {
  const holds = ['processing', 'completed', 'on-hold'].includes(o.status);
  if (holds && !o._stock_reduced) { moveStock(o, -1); countCoupons(o, +1); o._stock_reduced = true; }
  else if (['cancelled', 'refunded', 'failed'].includes(o.status) && o._stock_reduced) { moveStock(o, +1); countCoupons(o, -1); o._stock_reduced = false; }
}
const catAncestors = (ids) => { const out = new Set(); for (let id of ids) { let guard = 0; while (id && !out.has(id) && guard++ < 20) { out.add(id); id = db.categories.find((c) => c.id === id)?.parent; } } return [...out]; };
/** WC_Discounts, simplified: validates each coupon and spreads its discount over the order lines. Returns an error message or null. */
function applyCoupons(o, codes) {
  for (const raw of codes) {
    const code = String(raw || '').toLowerCase();
    const c = db.coupons.find((x) => x.code === code && x.status === 'publish');
    if (!c) return `Coupon "${code}" does not exist!`;
    if (c.date_expires && new Date(c.date_expires) < now()) return 'This coupon has expired.';
    if (c.usage_limit && Number(c.usage_count) >= Number(c.usage_limit)) return 'Coupon usage limit has been reached.';
    const who = [String(o.customer_id || ''), String(o.billing?.email || '').toLowerCase()].filter(Boolean);
    if (c.usage_limit_per_user && (c.used_by || []).filter((u) => who.includes(String(u).toLowerCase())).length >= Number(c.usage_limit_per_user)) return 'Coupon usage limit has been reached.';
    const sub = o.line_items.reduce((a, l) => a + Number(l.subtotal), 0);
    if (Number(c.minimum_amount) > 0 && sub < Number(c.minimum_amount)) return `The minimum spend for this coupon is $${money(c.minimum_amount)}.`;
    if (Number(c.maximum_amount) > 0 && sub > Number(c.maximum_amount)) return `The maximum spend for this coupon is $${money(c.maximum_amount)}.`;
    const valid = (l) => {
      const p = db.products.find((x) => x.id === l.product_id); if (!p) return false;
      const cats = catAncestors(p.categories.map((x) => x.id));
      let ok = !(c.product_ids || []).length && !(c.product_categories || []).length;
      if ((c.product_ids || []).map(Number).includes(p.id)) ok = true;
      if ((c.product_categories || []).map(Number).some((x) => cats.includes(x))) ok = true;
      if ((c.excluded_product_ids || []).map(Number).includes(p.id)) ok = false;
      if ((c.excluded_product_categories || []).map(Number).some((x) => cats.includes(x))) ok = false;
      if (c.exclude_sale_items && p.on_sale) ok = false;
      return ok;
    };
    const items = o.line_items.filter(valid);
    if (!items.length) return 'Sorry, this coupon is not applicable to selected products.';
    const amount = Number(c.amount) || 0;
    let total = 0;
    if (c.discount_type === 'percent' || c.discount_type === 'fixed_product') {
      for (const l of items) { const d = Math.min(Number(l.total), c.discount_type === 'percent' ? Number(l.subtotal) * Math.min(100, amount) / 100 : Math.min(amount, Number(l.price)) * l.quantity); l.total = money(Number(l.total) - d); total += d; }
    } else {
      const base = o.line_items.reduce((a, l) => a + Number(l.total), 0);
      const d = Math.min(amount, base);
      for (const l of o.line_items) { const share = base ? d * (Number(l.total) / base) : 0; l.total = money(Number(l.total) - share); }
      total += d;
    }
    o.coupon_lines.push({ id: o.id * 10 + 7 - o.coupon_lines.length, code, discount: money(total), discount_tax: '0.00' });
  }
  return null;
}
rerate();
save();

/* ── HTTP plumbing ───────────────────────────────────────────────────── */
const err = (status, code, message) => ({ status, body: { code, message, data: { status } } });
function authed(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Basic ')) { const [k, s] = Buffer.from(h.slice(6), 'base64').toString().split(':'); return k === KEY && s === SECRET; }
  return url.searchParams.get('consumer_key') === KEY && url.searchParams.get('consumer_secret') === SECRET;
}
const readBody = (req) => new Promise((res) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 2e6) { req.destroy(); res({}); } }); req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch { res({}); } }); });
function list(arr, q, headers) {
  const per = Math.min(100, Math.max(1, Number(q.get('per_page') || 10)));
  const page = Math.max(1, Number(q.get('page') || 1));
  headers['X-WP-Total'] = String(arr.length);
  headers['X-WP-TotalPages'] = String(Math.max(1, Math.ceil(arr.length / per)));
  return arr.slice((page - 1) * per, page * per);
}
const sortBy = (arr, key, order) => [...arr].sort((a, b) => { const x = a[key], y = b[key]; const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y)); return order === 'asc' ? c : -c; });
const catDescendants = (id) => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const c of db.categories) if (out.has(c.parent) && !out.has(c.id)) { out.add(c.id); grew = true; } } return out; };

/* ── products ────────────────────────────────────────────────────────── */
function normaliseProduct(p, patch) {
  const t = now();
  for (const [k, v] of Object.entries(patch)) {
    if (['id', 'permalink', 'date_created', 'total_sales'].includes(k)) continue;
    if (k === 'categories') p.categories = (v || []).map((c) => db.categories.find((x) => x.id === Number(c.id))).filter(Boolean).map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
    else if (k === 'images') p.images = (v || []).map((im) => ({ id: im.id || ++db.seq.image, src: im.src, name: im.name || p.name, alt: im.alt || '' }));
    else if (k === 'stock_quantity') p.stock_quantity = v == null ? null : Number(v);
    else p[k] = v;
  }
  if (patch.name && !patch.slug) p.slug = slugify(patch.name);
  const from = p.date_on_sale_from ? new Date(p.date_on_sale_from) : null;
  const to = p.date_on_sale_to ? new Date(p.date_on_sale_to) : null;
  const saleActive = p.sale_price !== '' && p.sale_price != null && Number(p.sale_price) < Number(p.regular_price) && (!from || from <= t) && (!to || to >= t);
  p.on_sale = saleActive;
  p.price = saleActive ? String(p.sale_price) : String(p.regular_price || '');
  if (p.manage_stock) p.stock_status = Number(p.stock_quantity) > 0 ? 'instock' : 'outofstock';
  p.date_modified = localISO(t); p.date_modified_gmt = gmtISO(t);
  return p;
}
function productsList(q) {
  let a = db.products;
  const status = q.get('status') || 'any';
  a = status === 'any' ? a.filter((p) => p.status !== 'trash') : a.filter((p) => status.split(',').includes(p.status));
  if (q.get('search')) { const s = q.get('search').toLowerCase(); a = a.filter((p) => p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s)); }
  if (q.get('sku')) a = a.filter((p) => p.sku === q.get('sku'));
  if (q.get('category')) { const ids = catDescendants(Number(q.get('category'))); a = a.filter((p) => p.categories.some((c) => ids.has(c.id))); }
  if (q.get('stock_status')) a = a.filter((p) => p.stock_status === q.get('stock_status'));
  if (q.get('featured')) a = a.filter((p) => String(p.featured) === q.get('featured'));
  if (q.get('on_sale')) a = a.filter((p) => String(p.on_sale) === q.get('on_sale'));
  if (q.get('include')) { const ids = q.get('include').split(',').map(Number); a = a.filter((p) => ids.includes(p.id)); }
  if (q.get('modified_after')) a = a.filter((p) => p.date_modified_gmt > q.get('modified_after').slice(0, 19));
  const ob = q.get('orderby') || 'date';
  const key = { date: 'date_created', id: 'id', title: 'name', modified: 'date_modified', popularity: 'total_sales', price: 'price' }[ob] || 'date_created';
  a = ob === 'price' ? [...a].sort((x, y) => (q.get('order') === 'asc' ? 1 : -1) * (Number(x.price) - Number(y.price))) : sortBy(a, key, q.get('order') || (ob === 'title' ? 'asc' : 'desc'));
  return a;
}
function createProduct(body) {
  const id = ++db.seq.product;
  const t = now();
  const p = { id, name: 'Untitled product', slug: '', permalink: `https://emulator.local/?p=${id}`, type: 'simple', status: 'draft', featured: false, catalog_visibility: 'visible', description: '', short_description: '', sku: '', price: '', regular_price: '', sale_price: '', on_sale: false, date_on_sale_from: null, date_on_sale_to: null, total_sales: 0, manage_stock: false, stock_quantity: null, stock_status: 'instock', low_stock_amount: null, categories: [], tags: [], brands: [], images: [], date_created: localISO(t), date_created_gmt: gmtISO(t) };
  normaliseProduct(p, body);
  db.products.unshift(p);
  return p;
}

/* ── router ──────────────────────────────────────────────────────────── */
async function route(req, url) {
  const headers = {};
  const q = url.searchParams;
  const path = url.pathname.replace(/^\/wp-json\/wc\/v3/, '').replace(/\/$/, '') || '/';
  const m = (re) => path.match(re);
  const method = req.method;
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};
  const done = (b, status = 200) => ({ status, body: b, headers });
  let x;

  if (path === '/') return done({ namespace: 'wc/v3', emulator: true });

  // products
  if (path === '/products' && method === 'GET') return done(list(productsList(q), q, headers));
  if (path === '/products' && method === 'POST') { const p = createProduct(body); recount(db); save(); return done(p, 201); }
  if (path === '/products/batch' && method === 'POST') {
    const out = { create: [], update: [], delete: [] };
    for (const c of body.create || []) out.create.push(createProduct(c));
    for (const u of body.update || []) { const p = db.products.find((y) => y.id === Number(u.id)); if (p) out.update.push(normaliseProduct(p, u)); }
    for (const d of body.delete || []) { const i = db.products.findIndex((y) => y.id === Number(d)); if (i >= 0) out.delete.push(db.products.splice(i, 1)[0]); }
    recount(db); save(); return done(out);
  }
  if ((x = m(/^\/products\/(\d+)$/))) {
    const p = db.products.find((y) => y.id === Number(x[1]));
    if (!p) return err(404, 'woocommerce_rest_product_invalid_id', 'Invalid ID.');
    if (method === 'GET') return done(p);
    if (method === 'PUT' || method === 'PATCH') { normaliseProduct(p, body); recount(db); save(); return done(p); }
    if (method === 'DELETE') {
      if (q.get('force') === 'true') { db.products = db.products.filter((y) => y !== p); recount(db); save(); return done(p); }
      p.status = 'trash'; recount(db); save(); return done(p);
    }
  }

  // categories
  if (path === '/products/categories' && method === 'GET') {
    let a = db.categories;
    if (q.get('search')) { const s = q.get('search').toLowerCase(); a = a.filter((c) => c.name.toLowerCase().includes(s)); }
    if (q.get('parent') != null && q.get('parent') !== '') a = a.filter((c) => c.parent === Number(q.get('parent')));
    if (q.get('include')) { const ids = q.get('include').split(',').map(Number); a = a.filter((c) => ids.includes(c.id)); }
    if (q.get('hide_empty') === 'true') a = a.filter((c) => c.count > 0);
    const ob = q.get('orderby') || 'name';
    a = sortBy(a, ob === 'count' ? 'count' : ob === 'id' ? 'id' : ob === 'menu_order' ? 'menu_order' : 'name', q.get('order') || 'asc');
    return done(list(a, q, headers));
  }
  if (path === '/products/categories' && method === 'POST') {
    if (!body.name) return err(400, 'woocommerce_rest_missing_name', 'Name is required.');
    const slug = body.slug || slugify(body.name);
    if (db.categories.some((c) => c.slug === slug)) return err(400, 'term_exists', 'A term with the name provided already exists with this parent.');
    const c = { id: ++db.seq.category, name: body.name, slug, parent: Number(body.parent || 0), description: body.description || '', display: 'default', image: body.image || null, menu_order: Number(body.menu_order || 0), count: 0 };
    db.categories.push(c); save(); return done(c, 201);
  }
  if ((x = m(/^\/products\/categories\/(\d+)$/))) {
    const c = db.categories.find((y) => y.id === Number(x[1]));
    if (!c) return err(404, 'woocommerce_rest_term_invalid', 'Resource does not exist.');
    if (method === 'GET') return done(c);
    if (method === 'PUT') {
      for (const k of ['name', 'slug', 'description', 'display', 'image']) if (k in body) c[k] = body[k];
      if ('parent' in body) c.parent = Number(body.parent);
      if ('menu_order' in body) c.menu_order = Number(body.menu_order);
      for (const p of db.products) for (const pc of p.categories) if (pc.id === c.id) { pc.name = c.name; pc.slug = c.slug; }
      save(); return done(c);
    }
    if (method === 'DELETE') {
      if (q.get('force') !== 'true') return err(501, 'woocommerce_rest_trash_not_supported', 'Resource does not support trashing.');
      db.categories = db.categories.filter((y) => y !== c);
      for (const y of db.categories) if (y.parent === c.id) y.parent = c.parent;
      for (const p of db.products) p.categories = p.categories.filter((pc) => pc.id !== c.id);
      recount(db); save(); return done(c);
    }
  }

  // reviews
  if (path === '/products/reviews' && method === 'GET') {
    let a = db.reviews;
    const st = q.get('status') || 'approved';
    if (st !== 'all') a = a.filter((v) => v.status === st);
    else a = a.filter((v) => v.status !== 'trash');
    if (q.get('product')) { const ids = q.get('product').split(',').map(Number); a = a.filter((v) => ids.includes(v.product_id)); }
    if (q.get('reviewer_email')) a = a.filter((v) => v.reviewer_email.toLowerCase() === q.get('reviewer_email').toLowerCase());
    if (q.get('search')) { const s = q.get('search').toLowerCase(); a = a.filter((v) => (v.review + v.reviewer + v.product_name).toLowerCase().includes(s)); }
    return done(list(sortBy(a, 'date_created', q.get('order') || 'desc'), q, headers));
  }
  if (path === '/products/reviews' && method === 'POST') {
    const p = db.products.find((y) => y.id === Number(body.product_id));
    if (!p) return err(404, 'woocommerce_rest_product_invalid_id', 'Invalid product ID.');
    if (!String(body.review || '').trim()) return err(400, 'woocommerce_rest_review_content_invalid', 'Invalid review content.');
    if (!body.reviewer || !body.reviewer_email) return err(400, 'woocommerce_rest_review_invalid', 'Reviewer name and email are required.');
    const t = now();
    const v = { id: ++db.seq.review, date_created: localISO(t), date_created_gmt: gmtISO(t), product_id: p.id, product_name: p.name, product_permalink: p.permalink, status: body.status || 'approved', reviewer: body.reviewer, reviewer_email: body.reviewer_email, review: body.review, rating: Math.max(0, Math.min(5, Number(body.rating || 0))), verified: boughtProduct(body.reviewer_email, 0, p.id) };
    db.reviews.unshift(v); rerate(); save(); return done(v, 201);
  }
  if ((x = m(/^\/products\/reviews\/(\d+)$/))) {
    const v = db.reviews.find((y) => y.id === Number(x[1]));
    if (!v) return err(404, 'woocommerce_rest_review_invalid_id', 'Invalid review ID.');
    if (method === 'GET') return done(v);
    if (method === 'PUT') {
      if (body.status === 'untrash' || body.status === 'unspam') { v.status = v.prev_status || 'hold'; delete v.prev_status; } else if (body.status) { if (['trash', 'spam'].includes(body.status)) v.prev_status = v.status; v.status = body.status; }
      for (const k of ['review', 'reviewer', 'rating']) if (k in body) v[k] = body[k];
      rerate(); save(); return done(v);
    }
    if (method === 'DELETE') {
      if (q.get('force') === 'true') { db.reviews = db.reviews.filter((y) => y !== v); rerate(); save(); return done({ deleted: true, previous: v }); }
      v.prev_status = v.status; v.status = 'trash'; rerate(); save(); return done(v);
    }
  }

  // orders
  if (path === '/orders' && method === 'GET') {
    let a = db.orders;
    const st = q.get('status') || 'any';
    a = st === 'any' ? a.filter((o) => o.status !== 'trash') : a.filter((o) => st.split(',').includes(o.status));
    if (q.get('customer')) a = a.filter((o) => o.customer_id === Number(q.get('customer')));
    if (q.get('search')) { const s = q.get('search').toLowerCase(); a = a.filter((o) => `${o.number} ${o.billing.first_name} ${o.billing.last_name} ${o.billing.email} ${o.billing.phone}`.toLowerCase().includes(s)); }
    if (q.get('after')) a = a.filter((o) => o.date_created >= q.get('after').slice(0, 19));
    if (q.get('before')) a = a.filter((o) => o.date_created < q.get('before').slice(0, 19));
    if (q.get('include')) { const ids = q.get('include').split(',').map(Number); a = a.filter((o) => ids.includes(o.id)); }
    return done(list(sortBy(a, q.get('orderby') === 'id' ? 'id' : 'date_created', q.get('order') || 'desc'), q, headers).map(pubOrder));
  }
  if (path === '/orders' && method === 'POST') {
    const lines = [];
    for (const li of body.line_items || []) {
      const p = db.products.find((y) => y.id === Number(li.product_id));
      if (!p) return err(400, 'woocommerce_rest_invalid_product_id', `Product ID ${li.product_id} is invalid.`);
      const qn = Math.max(1, Number(li.quantity || 1)); const unit = Number(p.price || 0);
      lines.push({ id: 0, name: p.name, product_id: p.id, variation_id: 0, quantity: qn, subtotal: money(unit * qn), total: money(unit * qn), sku: p.sku, price: unit, image: p.images[0] ? { id: p.images[0].id, src: p.images[0].src } : { id: '', src: '' }, meta_data: [] });
    }
    if (!lines.length) return err(400, 'woocommerce_rest_required_line_items', 'Line items are required.');
    const t = now(); const id = ++db.seq.order;
    lines.forEach((l, j) => { l.id = id * 10 + j; });
    const shipping_lines = (body.shipping_lines || []).map((sl, j) => ({ id: id * 10 + 8 - j, method_id: sl.method_id || 'flat_rate', method_title: sl.method_title || 'Shipping', total: money(sl.total || 0) }));
    const items = lines.reduce((a, l) => a + Number(l.total), 0); const ship = shipping_lines.reduce((a, l) => a + Number(l.total), 0);
    const billing = { first_name: '', last_name: '', company: '', address_1: '', address_2: '', city: '', state: '', postcode: '', country: '', email: '', phone: '', ...(body.billing || {}) };
    const o = {
      id, number: String(id), order_key: orderKey(), status: body.status || 'pending', currency: 'USD', prices_include_tax: false,
      date_created: localISO(t), date_created_gmt: gmtISO(t), date_modified: localISO(t), date_modified_gmt: gmtISO(t), date_paid: null, date_completed: null,
      discount_total: '0.00', shipping_total: money(ship), total_tax: '0.00', total: money(items + ship), customer_id: Number(body.customer_id || 0),
      customer_note: body.customer_note || '', billing, shipping: { ...billing, email: undefined, phone: undefined, ...(body.shipping || {}) },
      payment_method: body.payment_method || '', payment_method_title: body.payment_method_title || '', transaction_id: '', customer_ip_address: '', created_via: 'rest-api',
      line_items: lines, shipping_lines, fee_lines: [], coupon_lines: [], refunds: [], _stock_reduced: false,
    };
    const couponError = applyCoupons(o, (body.coupon_lines || []).map((cl) => cl.code).filter(Boolean));
    if (couponError) { db.seq.order--; return err(400, 'woocommerce_rest_invalid_coupon', couponError); }
    const discount = o.coupon_lines.reduce((a, cl) => a + Number(cl.discount), 0);
    o.discount_total = money(discount);
    o.total = money(o.line_items.reduce((a, l) => a + Number(l.total), 0) + ship);
    db.orders.push(o); db.notes[id] = [];
    syncStock(o);
    const cu = db.customers.find((y) => y.id === o.customer_id);
    if (cu && PAID.has(o.status)) cu.is_paying_customer = true;
    save(); return done(pubOrder(o), 201);
  }
  if ((x = m(/^\/orders\/(\d+)\/notes$/))) {
    const o = db.orders.find((y) => y.id === Number(x[1]));
    if (!o) return err(404, 'woocommerce_rest_shop_order_invalid_id', 'Invalid ID.');
    db.notes[o.id] ||= [];
    if (method === 'GET') return done([...db.notes[o.id]].sort((a, b) => b.date_created.localeCompare(a.date_created)));
    if (method === 'POST') {
      if (!body.note) return err(400, 'woocommerce_rest_missing_note', 'Note is required.');
      const t = now();
      const n = { id: db.seq.note++, author: 'DMD World', date_created: localISO(t), date_created_gmt: gmtISO(t), note: body.note, customer_note: !!body.customer_note };
      db.notes[o.id].push(n); save(); return done(n, 201);
    }
  }
  if ((x = m(/^\/orders\/(\d+)$/))) {
    const o = db.orders.find((y) => y.id === Number(x[1]));
    if (!o) return err(404, 'woocommerce_rest_shop_order_invalid_id', 'Invalid ID.');
    if (method === 'GET') return done(pubOrder(o));
    if (method === 'PUT') {
      const t = now();
      if (body.status && body.status !== o.status) {
        const label = (s) => ({ pending: 'Pending payment', processing: 'Processing', 'on-hold': 'On hold', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed', trash: 'Trash' }[s] || s);
        (db.notes[o.id] ||= []).push({ id: db.seq.note++, author: 'system', date_created: localISO(t), date_created_gmt: gmtISO(t), note: `Order status changed from ${label(o.status)} to ${label(body.status)}.`, customer_note: false });
        o.status = body.status;
        if (body.status === 'completed') { o.date_completed = localISO(t); o.date_paid ||= localISO(t); }
        if (body.status === 'processing') o.date_paid ||= localISO(t);
        syncStock(o);
        const cu = db.customers.find((y) => y.id === o.customer_id);
        if (cu && PAID.has(o.status)) cu.is_paying_customer = true;
      }
      for (const k of ['customer_note', 'billing', 'shipping', 'payment_method', 'payment_method_title', 'transaction_id']) if (k in body) o[k] = typeof body[k] === 'object' ? { ...o[k], ...body[k] } : body[k];
      o.date_modified = localISO(t); o.date_modified_gmt = gmtISO(t);
      save(); return done(pubOrder(o));
    }
    if (method === 'DELETE') {
      if (q.get('force') === 'true') { db.orders = db.orders.filter((y) => y !== o); save(); return done(pubOrder(o)); }
      o.prev_status = o.status; o.status = 'trash'; save(); return done(pubOrder(o));
    }
  }

  // customers
  if (path === '/customers' && method === 'GET') {
    let a = db.customers;
    if (q.get('search')) { const s = q.get('search').toLowerCase(); a = a.filter((c) => `${c.first_name} ${c.last_name} ${c.email} ${c.username}`.toLowerCase().includes(s)); }
    if (q.get('email')) a = a.filter((c) => c.email === q.get('email'));
    if (q.get('include')) { const ids = q.get('include').split(',').map(Number); a = a.filter((c) => ids.includes(c.id)); }
    const ob = q.get('orderby') || 'name';
    a = ob === 'registered_date' ? sortBy(a, 'date_created', q.get('order') || 'desc') : ob === 'id' ? sortBy(a, 'id', q.get('order') || 'asc') : [...a].sort((x, y) => (q.get('order') === 'desc' ? -1 : 1) * `${x.first_name} ${x.last_name}`.localeCompare(`${y.first_name} ${y.last_name}`));
    return done(list(a, q, headers).map(pubCustomer));
  }
  const emailTaken = (email, exceptId) => db.customers.some((y) => y.id !== exceptId && y.email.toLowerCase() === String(email).toLowerCase());
  const mergeMeta = (c, meta) => { for (const mm of meta || []) { const i = c.meta_data.findIndex((y) => y.key === mm.key); if (i >= 0) c.meta_data[i].value = mm.value; else c.meta_data.push({ id: Date.now() + c.meta_data.length, key: mm.key, value: mm.value }); } };
  if (path === '/customers' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return err(400, 'registration-error-invalid-email', 'Please provide a valid email address.');
    if (emailTaken(email)) return err(400, 'registration-error-email-exists', 'An account is already registered with your email address.');
    const t = now(); const id = ++db.seq.customer;
    const blank = { first_name: '', last_name: '', company: '', address_1: '', address_2: '', city: '', state: '', postcode: '', country: '' };
    const c = { id, email, first_name: body.first_name || '', last_name: body.last_name || '', username: email.split('@')[0].replace(/[^a-z0-9]/g, '') + id, role: 'customer', date_created: localISO(t), date_created_gmt: gmtISO(t), date_modified: localISO(t), billing: { ...blank, email, phone: '', ...(body.billing || {}) }, shipping: { ...blank, ...(body.shipping || {}) }, is_paying_customer: false, avatar_url: '', meta_data: [], _pw: hashPassword(body.password || randomBytes(12).toString('hex')) };
    mergeMeta(c, body.meta_data);
    db.customers.push(c); save(); return done(pubCustomer(c), 201);
  }
  if ((x = m(/^\/customers\/(\d+)$/))) {
    const c = db.customers.find((y) => y.id === Number(x[1]));
    if (!c) return err(404, 'woocommerce_rest_invalid_id', 'Invalid resource ID.');
    if (method === 'GET') return done(pubCustomer(c));
    if (method === 'PUT') {
      if (body.email && emailTaken(body.email, c.id)) return err(400, 'registration-error-email-exists', 'An account is already registered with your email address.');
      for (const k of ['email', 'first_name', 'last_name']) if (k in body) c[k] = k === 'email' ? String(body[k]).toLowerCase() : body[k];
      for (const k of ['billing', 'shipping']) if (body[k]) c[k] = { ...c[k], ...body[k] };
      if (body.password) c._pw = hashPassword(body.password);
      mergeMeta(c, body.meta_data);
      c.date_modified = localISO(now()); save(); return done(pubCustomer(c));
    }
  }

  // coupons
  if (path === '/coupons' && method === 'GET') {
    let a = db.coupons.filter((c) => c.status !== 'trash');
    if (q.get('status') === 'trash') a = db.coupons.filter((c) => c.status === 'trash');
    if (q.get('search')) a = a.filter((c) => c.code.includes(q.get('search').toLowerCase()));
    if (q.get('code')) a = a.filter((c) => c.code === q.get('code').toLowerCase());
    return done(list(sortBy(a, 'date_created', 'desc'), q, headers));
  }
  const couponFields = ['amount', 'discount_type', 'description', 'date_expires', 'individual_use', 'product_ids', 'excluded_product_ids', 'usage_limit', 'usage_limit_per_user', 'free_shipping', 'product_categories', 'excluded_product_categories', 'minimum_amount', 'maximum_amount', 'status'];
  if (path === '/coupons' && method === 'POST') {
    if (!body.code) return err(400, 'woocommerce_rest_empty_coupon_code', 'The coupon code cannot be empty.');
    if (db.coupons.some((c) => c.code === body.code.toLowerCase() && c.status !== 'trash')) return err(400, 'woocommerce_rest_coupon_code_already_exists', 'The coupon code already exists');
    const c = { id: ++db.seq.coupon, code: body.code.toLowerCase(), amount: '0.00', status: 'publish', discount_type: 'fixed_cart', description: '', date_expires: null, usage_count: 0, individual_use: false, product_ids: [], excluded_product_ids: [], usage_limit: null, usage_limit_per_user: null, free_shipping: false, product_categories: [], excluded_product_categories: [], minimum_amount: '0.00', maximum_amount: '0.00', date_created: localISO(now()) };
    for (const k of couponFields) if (k in body) c[k] = body[k];
    db.coupons.unshift(c); save(); return done(c, 201);
  }
  if ((x = m(/^\/coupons\/(\d+)$/))) {
    const c = db.coupons.find((y) => y.id === Number(x[1]));
    if (!c) return err(404, 'woocommerce_rest_shop_coupon_invalid_id', 'Invalid ID.');
    if (method === 'GET') return done(c);
    if (method === 'PUT') { if (body.code) c.code = body.code.toLowerCase(); for (const k of couponFields) if (k in body) c[k] = body[k]; save(); return done(c); }
    if (method === 'DELETE') {
      if (q.get('force') === 'true') { db.coupons = db.coupons.filter((y) => y !== c); save(); return done(c); }
      c.status = 'trash'; save(); return done(c);
    }
  }

  // settings
  if ((x = m(/^\/settings\/(\w+)$/)) && method === 'GET') { const g = db.settings[x[1]]; return g ? done(g) : err(404, 'rest_setting_setting_group_invalid', 'Invalid setting group.'); }
  if ((x = m(/^\/settings\/(\w+)\/batch$/)) && method === 'POST') {
    const g = db.settings[x[1]]; if (!g) return err(404, 'rest_setting_setting_group_invalid', 'Invalid setting group.');
    const update = (body.update || []).map((u) => { const s = g.find((y) => y.id === u.id); if (s) s.value = String(u.value); return s; }).filter(Boolean);
    save(); return done({ update });
  }
  if ((x = m(/^\/settings\/(\w+)\/([\w-]+)$/)) && method === 'PUT') {
    const s = db.settings[x[1]]?.find((y) => y.id === x[2]); if (!s) return err(404, 'rest_setting_setting_invalid', 'Invalid setting.');
    s.value = String(body.value); save(); return done(s);
  }

  // payment gateways (the two the store uses)
  if (path === '/payment_gateways' && method === 'GET') return done([
    { id: 'cod', title: 'Cash on delivery', description: 'Pay with cash when your order is delivered.', enabled: true },
    { id: 'bacs', title: 'Direct bank transfer', description: 'Transfer to DMD World’s bank account. Your order ships once the money arrives.', enabled: true },
  ]);

  // reports
  if (path === '/reports/orders/totals') {
    const names = { pending: 'Pending payment', processing: 'Processing', 'on-hold': 'On hold', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed', 'checkout-draft': 'Draft' };
    return done(Object.entries(names).map(([slug, name]) => ({ slug, name, total: db.orders.filter((o) => o.status === slug).length })));
  }
  if (path === '/reports/products/totals') return done(['simple', 'variable', 'grouped', 'external'].map((slug) => ({ slug, name: slug, total: slug === 'simple' ? db.products.filter((p) => p.status !== 'trash').length : 0 })));
  if (path === '/reports/customers/totals') return done([{ slug: 'paying', name: 'Paying customer', total: db.customers.filter((c) => c.is_paying_customer).length }, { slug: 'non_paying', name: 'Non-paying customer', total: db.customers.filter((c) => !c.is_paying_customer).length }]);
  if (path === '/reports/reviews/totals') return done([1, 2, 3, 4, 5].map((n) => ({ slug: `rated_${n}_out_of_5`, name: `Rated ${n} out of 5`, total: db.reviews.filter((v) => v.rating === n && v.status === 'approved').length })));
  if (path === '/reports/sales') {
    const min = q.get('date_min') || '2000-01-01', max = (q.get('date_max') || '2999-12-31') + 'T23:59:59';
    const os = db.orders.filter((o) => ['completed', 'processing', 'on-hold'].includes(o.status) && o.date_created >= min && o.date_created <= max);
    const total = os.reduce((a, o) => a + Number(o.total), 0);
    return done([{ total_sales: money(total), net_sales: money(total - os.reduce((a, o) => a + Number(o.shipping_total), 0)), average_sales: money(total / Math.max(1, os.length)), total_orders: os.length, total_items: os.reduce((a, o) => a + o.line_items.reduce((b, l) => b + l.quantity, 0), 0), total_tax: '0.00', total_shipping: money(os.reduce((a, o) => a + Number(o.shipping_total), 0)), total_refunds: 0, total_discount: '0.00', totals_grouped_by: 'day', totals: {} }]);
  }

  return err(404, 'rest_no_route', 'No route was found matching the URL and request method.');
}

/* ── the DMD Buyer Auth plugin (wordpress/dmd-buyer-auth), emulated ─────── */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
async function plugin(req, url) {
  if (!PLUGIN_SECRET || PLUGIN_SECRET.length < 32) return err(503, 'dmd_not_configured', 'Not configured.');
  const given = Buffer.from(String(req.headers['x-dmd-secret'] || '')), real = Buffer.from(PLUGIN_SECRET);
  if (given.length !== real.length || !timingSafeEqual(given, real)) return err(403, 'dmd_forbidden', 'Forbidden.');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const path = url.pathname.replace(/^\/wp-json\/dmd\/v1/, '');
  const find = (login) => db.customers.find((c) => c.email.toLowerCase() === String(login || '').trim().toLowerCase() || c.username === String(login || '').trim());
  if (path === '/auth' && req.method === 'POST') {
    const c = find(body.login);
    // Always run one password check, so a missing account answers as slowly as a wrong password.
    const ok = verifyPassword(String(body.password || ''), c?._pw || DUMMY_HASH);
    if (!c || !c._pw || c.role !== 'customer' || !ok) return err(401, 'dmd_invalid', 'Invalid email or password.');
    return { status: 200, body: { id: c.id, email: c.email } };
  }
  if (path === '/send-reset' && req.method === 'POST') {
    const link = String(body.link || '');
    if (!link.startsWith(`${STOREFRONT_URL}/`)) return err(400, 'dmd_bad_link', 'Reset link must point to the storefront.');
    const c = find(body.email);
    if (!c || c.role !== 'customer') return { status: 200, body: { sent: false } };
    mkdirSync(OUTBOX, { recursive: true });
    const text = `To: ${c.email}\nSubject: [DMD World] Reset your password\n\nHi ${c.first_name || c.username},\n\nSomeone asked to reset the password for your DMD World account (${c.email}).\nTo choose a new password, open this link within 1 hour:\n${link}\n\nIf you didn't ask for this, ignore this email; your password won't change.\n`;
    writeFileSync(join(OUTBOX, `${Date.now()}-reset-${c.id}.txt`), text);
    return { status: 200, body: { sent: true } };
  }
  if (path === '/notify-stock' && req.method === 'POST') {
    const link = String(body.link || '');
    if (!link.startsWith(`${STOREFRONT_URL}/`)) return err(400, 'dmd_bad_link', 'Links must point to the storefront.');
    const c = db.customers.find((y) => y.id === Number(body.customer_id));
    const p = db.products.find((y) => y.id === Number(body.product_id));
    if (!c || c.role !== 'customer' || !p) return { status: 200, body: { sent: false } };
    mkdirSync(OUTBOX, { recursive: true });
    const text = `To: ${c.email}
Subject: [DMD World] ${p.name} is back in stock

Hi ${c.first_name || c.username},

Good news: ${p.name} is back in stock at DMD World.
${link}

Stock can go quickly, so order soon if you still want it.
You asked us to email you about this product. We won't email you about it again.
`;
    writeFileSync(join(OUTBOX, `${Date.now()}-stock-${c.id}-${p.id}.txt`), text);
    return { status: 200, body: { sent: true } };
  }
  return err(404, 'rest_no_route', 'No route was found matching the URL and request method.');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let out;
  try {
    if (url.pathname.startsWith('/wp-json/dmd/v1')) out = await plugin(req, url);
    else if (!url.pathname.startsWith('/wp-json/wc/v3')) out = err(404, 'rest_no_route', 'Only /wp-json/wc/v3 and /wp-json/dmd/v1 are emulated.');
    else if (!authed(req, url)) out = err(401, 'woocommerce_rest_cannot_view', 'Sorry, you cannot list resources.');
    else out = await route(req, url);
  } catch (e) { console.error(e); out = err(500, 'internal_error', e.message); }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', ...(out.headers || {}) });
  res.end(JSON.stringify(out.body));
}).listen(PORT, '127.0.0.1', () => console.log(`WooCommerce test emulator (NOT your store) on http://127.0.0.1:${PORT}/wp-json/wc/v3 (this machine only)`));
