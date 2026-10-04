// End-to-end API tests against a private emulator + server (see harness.mjs). Run: npm --prefix server test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, newBuyer, email, sleep, OWNER_PASSWORD, BUYER_PASSWORD } from './harness.mjs';

let S;
let owner;
const ids = {}; // products picked from the emulator's seeded catalog
before(async () => {
  S = await startStack();
  owner = await S.owner();
  const inv = await owner.get('/admin/api/inventory?per=100');
  const all = (await owner.get('/admin/api/products?status=publish&per=100')).body.items;
  ids.plenty = all.find((p) => p.manage_stock && p.stock_quantity >= 20 && Number(p.price) > 0).id;
  ids.plenty2 = all.find((p) => p.manage_stock && p.stock_quantity >= 20 && Number(p.price) > 0 && p.id !== ids.plenty).id;
  ids.out = inv.body.items.find((p) => p.level === 'out')?.id || all.find((p) => p.stock_status === 'outofstock')?.id;
  ids.ps4game = all.find((p) => p.categories.some((c) => c.id === 336) && p.stock_quantity >= 5)?.id; // coupon ps4games5 covers category 336
  assert.ok(ids.plenty && ids.plenty2 && ids.out && ids.ps4game, `test products found: ${JSON.stringify(ids)}`);
});
after(async () => { await S?.stop(); });

const contact = (mail = email('guest')) => ({ firstName: 'Guest', lastName: 'Tester', email: mail, phone: '+961 70 123 456' });
const key = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

describe('platform', () => {
  test('health check reports the store connection', async () => {
    const r = await S.client().get('/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.store, true);
  });
  test('API answers carry no-store and strict headers', async () => {
    const r = await S.client().get('/api/session');
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  });
  test('unknown routes are 404 JSON, malformed encodings never crash', async () => {
    const c = S.client();
    assert.equal((await c.get('/api/nope')).status, 404);
    assert.equal((await c.get('/api/products/%E0%A4%A/reviews')).status, 404);
    assert.equal((await c.get('/healthz')).status, 200);
  });
});

describe('owner authentication', () => {
  test('wrong password is refused, right one opens the admin', async () => {
    const c = S.client();
    assert.equal((await c.post('/admin/api/login', { password: 'Nope-Wrong-1!' })).status, 401);
    assert.equal((await c.get('/admin/api/badges')).status, 401);
    assert.equal((await c.post('/admin/api/login', { password: OWNER_PASSWORD })).status, 200);
    assert.equal((await c.get('/admin/api/badges')).status, 200);
  });
  test('a signed-in device is remembered for the store-wide lockout', async () => {
    const c = S.client();
    const r = await c.post('/admin/api/login', { password: OWNER_PASSWORD });
    assert.ok(c.jar.dmd_device, 'device cookie set');
    assert.ok(r.headers.getSetCookie().some((sc) => /^dmd_device=.*Path=\/admin\/api\/login/.test(sc) && /HttpOnly/.test(sc)), 'device cookie only goes to the login route');
  });
  test('per-address lockout after 5 wrong passwords', async () => {
    const c = S.client();
    for (let i = 0; i < 5; i++) await c.post('/admin/api/login', { password: `Wrong-Pass-${i}!` });
    assert.equal((await c.post('/admin/api/login', { password: OWNER_PASSWORD })).status, 429);
  });
  test('logout revokes the token everywhere', async () => {
    const a = await S.owner();
    const stolen = { ...a.jar };
    await a.post('/admin/api/logout');
    const thief = S.client(); Object.assign(thief.jar, stolen);
    assert.equal((await thief.get('/admin/api/badges')).status, 401);
  });
  test('owner password change: wrong current password is limited', async () => {
    const a = await S.owner();
    for (let i = 0; i < 5; i++) assert.equal((await a.post('/admin/api/settings/password', { current: `Guess-${i}-Aa!`, next: 'Another-Pass-9!', confirm: 'Another-Pass-9!' })).status, 401);
    assert.equal((await a.post('/admin/api/settings/password', { current: OWNER_PASSWORD, next: 'Another-Pass-9!', confirm: 'Another-Pass-9!' })).status, 429);
  });
});

describe('separation of owner and buyers', () => {
  test('a buyer session cannot use the admin API', async () => {
    const b = await newBuyer(S, 'sep');
    assert.equal((await b.get('/admin/api/orders')).status, 401);
    assert.equal((await b.get('/admin/api/customers')).status, 401);
  });
  test('the owner session is not a buyer session', async () => {
    assert.equal((await owner.get('/api/me')).status, 401);
    assert.equal((await owner.get('/api/session')).body.buyer, null);
  });
  test('cross-site and foreign-origin writes are refused', async () => {
    const b = await newBuyer(S, 'csrf');
    assert.equal((await b.put('/api/me/wishlist', { ids: [1] }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await b.put('/api/me/wishlist', { ids: [1] }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await b('POST', '/api/logout', 'x=1', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
  });
});

describe('buyer accounts', () => {
  test('weak passwords are refused at sign-up', async () => {
    const c = S.client();
    const r = await c.post('/api/register', { firstName: 'A', lastName: 'B', email: email('weak'), password: 'password', confirm: 'password' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'weak_password');
  });
  test('sign up, sign out, sign in, session', async () => {
    const b = await newBuyer(S, 'flow');
    assert.equal((await b.get('/api/me')).body.email, b.email);
    await b.post('/api/logout');
    assert.equal((await b.get('/api/me')).status, 401);
    assert.equal((await b.post('/api/login', { email: b.email, password: 'Wrong-Pass-1!' })).status, 401);
    assert.equal((await b.post('/api/login', { email: b.email, password: BUYER_PASSWORD })).status, 200);
    assert.equal((await b.get('/api/session')).body.buyer.email, b.email);
  });
  test('markup is stripped from names', async () => {
    const c = S.client();
    const r = await c.post('/api/register', { firstName: '<img src=x onerror=alert(1)>Ana', lastName: '<b>Lee</b>', email: email('xss'), password: BUYER_PASSWORD, confirm: BUYER_PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.body.buyer.firstName, 'Ana');
    assert.equal(r.body.buyer.lastName, 'Lee');
  });
  test('wrong current password while signed in is limited (a stolen session can’t guess it)', async () => {
    const b = await newBuyer(S, 'pwlimit');
    for (let i = 0; i < 5; i++) assert.equal((await b.post('/api/me/password', { current: `Nope-${i}-Aa!`, next: 'New-Pass-77!', confirm: 'New-Pass-77!' })).status, 401);
    assert.equal((await b.post('/api/me/password', { current: BUYER_PASSWORD, next: 'New-Pass-77!', confirm: 'New-Pass-77!' })).status, 429);
  });
  test('password change signs out other devices and keeps this one', async () => {
    const b = await newBuyer(S, 'pwchange');
    const other = S.client();
    await other.post('/api/login', { email: b.email, password: BUYER_PASSWORD });
    assert.equal((await other.get('/api/me')).status, 200);
    assert.equal((await b.post('/api/me/password', { current: BUYER_PASSWORD, next: 'Fresh-Pass-88!', confirm: 'Fresh-Pass-88!' })).status, 200);
    assert.equal((await b.get('/api/me')).status, 200);
    assert.equal((await other.get('/api/me')).status, 401);
  });
  test('wishlist keeps only valid product ids', async () => {
    const b = await newBuyer(S, 'wish');
    const r = await b.put('/api/me/wishlist', { ids: [String(ids.plenty), { a: 1 }, -5, 'x', 1e15] });
    assert.deepEqual(r.body.ids, [ids.plenty]);
  });
});

describe('live catalog', () => {
  test('lists purchasable products with live prices and revalidates with ETag', async () => {
    const c = S.client();
    const r = await c.get('/api/catalog');
    assert.equal(r.status, 200);
    assert.ok(r.body.products.length > 50);
    const row = r.body.products.find((x) => x[0] === ids.plenty);
    assert.ok(row, 'in-stock product listed');
    const etag = r.headers.get('etag');
    assert.equal((await c.get('/api/catalog', { 'If-None-Match': etag })).status, 304);
  });
  test('owner price changes and hidden products reach the catalog straight away', async () => {
    const before = (await owner.get(`/admin/api/products/${ids.plenty2}`)).body;
    await owner.put(`/admin/api/products/${ids.plenty2}`, { regular_price: '77.00', sale_price: '' });
    let row = (await S.client().get('/api/catalog')).body.products.find((x) => x[0] === ids.plenty2);
    assert.equal(row[2], 77);
    await owner.put(`/admin/api/products/${ids.plenty2}`, { catalog_visibility: 'hidden' });
    row = (await S.client().get('/api/catalog')).body.products.find((x) => x[0] === ids.plenty2);
    assert.equal(row, undefined, 'hidden product is not listed');
    const q = await S.client().post('/api/cart/quote', { items: [{ id: ids.plenty2, qty: 1 }] });
    assert.equal(q.body.lines[0].code, 'unavailable', 'and cannot be bought');
    await owner.put(`/admin/api/products/${ids.plenty2}`, { catalog_visibility: 'visible', regular_price: before.regular_price, sale_price: before.sale_price });
  });
  test('stock is only revealed when it runs low', async () => {
    const rows = (await S.client().get('/api/catalog')).body.products;
    assert.ok(rows.every((r) => r[7] === null || r[7] <= 10));
  });
  test('sitemap and robots are only served with the storefront', async () => {
    assert.equal((await S.client().get('/sitemap.xml')).status, 404);
  });
});

describe('quotes, coupons and orders', () => {
  test('quote uses live prices and flags stock problems', async () => {
    const q = await S.client().post('/api/cart/quote', { items: [{ id: ids.plenty, qty: 2 }, { id: ids.out, qty: 1 }] });
    assert.equal(q.status, 200);
    assert.equal(q.body.ok, false);
    assert.equal(q.body.lines.find((l) => l.id === ids.out).code, 'sold_out');
    const good = q.body.lines.find((l) => l.id === ids.plenty);
    assert.equal(good.problem, null);
    assert.equal(q.body.subtotal, Math.round(good.price * 2 * 100) / 100);
  });
  test('coupon rules: minimum spend, category, unknown code', async () => {
    const c = S.client();
    const min = await c.post('/api/cart/quote', { items: [{ id: ids.ps4game, qty: 1 }], coupon: 'welcome10' });
    const price = min.body.lines[0].price;
    if (price < 20) assert.match(min.body.coupon.message, /Spend at least/);
    const ps4 = await c.post('/api/cart/quote', { items: [{ id: ids.ps4game, qty: 1 }], coupon: 'PS4GAMES5' });
    assert.equal(ps4.body.coupon.ok, true);
    assert.equal(ps4.body.discount, Math.min(5, price));
    const bad = await c.post('/api/cart/quote', { items: [{ id: ids.plenty, qty: 1 }], coupon: 'not-a-code' });
    assert.equal(bad.body.coupon.ok, false);
  });
  test('a coupon order is totalled by WooCommerce and matches the quote', async () => {
    const c = S.client();
    const q = await c.post('/api/cart/quote', { items: [{ id: ids.ps4game, qty: 1 }], coupon: 'ps4games5' });
    const o = await c.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.ps4game, qty: 1 }], coupon: 'ps4games5', contact: contact(), method: 'pickup', payment: 'cod' });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(Number(o.body.total), q.body.total);
    const view = await c.get(`/api/orders/${o.body.id}?key=${o.body.key}`);
    assert.deepEqual(view.body.coupons, ['PS4GAMES5']);
    assert.equal(Number(view.body.discount), q.body.discount);
  });
  test('the browser’s prices are ignored', async () => {
    const c = S.client();
    const live = (await c.post('/api/cart/quote', { items: [{ id: ids.plenty, qty: 1 }] })).body.lines[0].price;
    const o = await c.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.plenty, qty: 1, price: 0.01, total: 0.01 }], contact: contact(), method: 'pickup' });
    assert.equal(Number(o.body.total), live);
  });
  test('a retried "Place order" never creates a second order', async () => {
    const c = S.client();
    const body = { idempotencyKey: key(), items: [{ id: ids.plenty, qty: 1 }], contact: contact(), method: 'pickup', payment: 'cod' };
    const results = await Promise.all([c.post('/api/orders', body), c.post('/api/orders', body), c.post('/api/orders', body)]);
    const again = await c.post('/api/orders', body);
    const idsSeen = new Set([...results, again].map((r) => r.body.id));
    assert.equal(idsSeen.size, 1, `one order: ${[...idsSeen]}`);
  });
  test('sold-out items and bad input are refused before anything is created', async () => {
    const c = S.client();
    assert.equal((await c.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.out, qty: 1 }], contact: contact(), method: 'pickup' })).body.code, 'sold_out');
    assert.equal((await c.post('/api/orders', { items: 'lots', contact: 5, address: [] })).status, 400);
    assert.equal((await c.post('/api/orders', { items: [{ id: ids.plenty, qty: 6 }, { id: ids.plenty, qty: 6 }], contact: contact(), method: 'pickup' })).status, 400);
    const fields = await c.post('/api/orders', { items: [{ id: ids.plenty, qty: 1 }], contact: { firstName: '', email: 'nope' }, method: 'delivery' });
    assert.equal(fields.status, 400);
    assert.ok(fields.body.fields.email && fields.body.fields.address_1);
  });
});

describe('order privacy and cancelling', () => {
  test('buyers only ever see their own orders', async () => {
    const a = await newBuyer(S, 'owner-a');
    const b = await newBuyer(S, 'owner-b');
    const o = await a.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.plenty, qty: 1 }], contact: contact(a.email), method: 'pickup' });
    assert.equal(o.status, 200);
    assert.equal(o.body.key, null, 'signed-in buyers get no guest key');
    assert.equal((await a.get(`/api/me/orders/${o.body.id}`)).status, 200);
    assert.equal((await b.get(`/api/me/orders/${o.body.id}`)).status, 404);
    assert.equal((await b.get(`/api/orders/${o.body.id}`)).status, 404);
    assert.equal((await b.get(`/api/orders/${o.body.id}?key=wc_order_guess`)).status, 404);
    assert.equal((await b.post(`/api/orders/${o.body.id}/cancel`, {})).status, 404);
    assert.equal((await b.get(`/api/me/messages/${o.body.id}`)).status, 404);
    assert.ok((await a.get('/api/me/orders')).body.items.some((x) => x.id === o.body.id));
    assert.ok(!(await b.get('/api/me/orders')).body.items.some((x) => x.id === o.body.id));
  });
  test('a guest cancels their pending order with its key; confirmed orders can’t be cancelled', async () => {
    const c = S.client();
    const o = (await c.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.plenty, qty: 1 }], contact: contact(), method: 'pickup' })).body;
    assert.equal((await S.client().post(`/api/orders/${o.id}/cancel`, { key: 'wc_order_000000000000' })).status, 404);
    const done = await c.post(`/api/orders/${o.id}/cancel`, { key: o.key, reason: 'Ordered by mistake <script>' });
    assert.equal(done.status, 200);
    assert.equal(done.body.status, 'cancelled');
    assert.equal((await c.post(`/api/orders/${o.id}/cancel`, { key: o.key })).status, 409);
    const o2 = (await c.post('/api/orders', { idempotencyKey: key(), items: [{ id: ids.plenty, qty: 1 }], contact: contact(), method: 'pickup' })).body;
    await owner.put(`/admin/api/orders/${o2.id}/status`, { status: 'processing' });
    const late = await c.post(`/api/orders/${o2.id}/cancel`, { key: o2.key });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'not_cancellable');
  });
});

describe('reviews', () => {
  test('one pending review per buyer and product, even when sent twice at once', async () => {
    const b = await newBuyer(S, 'review');
    const body = { productId: ids.plenty, rating: 5, title: 'Great', text: 'Works exactly as described, recommended.' };
    const [x, y] = await Promise.all([b.post('/api/me/reviews', body), b.post('/api/me/reviews', body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
    const mine = (await b.get(`/api/me/reviews?product=${ids.plenty}`)).body.items;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'pending');
    assert.equal((await b.post('/api/me/reviews', body)).body.code, 'already_reviewed');
  });
  test('review text is stored escaped', async () => {
    const b = await newBuyer(S, 'review-xss');
    const r = await b.post('/api/me/reviews', { productId: ids.plenty2, rating: 4, title: '<b>Title</b>', text: '<script>alert(1)</script> but good' });
    assert.equal(r.status, 200);
    assert.equal(r.body.title, '<b>Title</b>', 'shown as text, not markup');
    const raw = (await owner.get(`/admin/api/reviews?status=hold&search=${encodeURIComponent('but good')}`)).body.items[0];
    assert.ok(raw && !/<script>/.test(raw.review));
  });
});

describe('back-in-stock alerts', () => {
  test('a waiting buyer is emailed when the owner restocks, and the alert is cleared', async () => {
    const b = await newBuyer(S, 'alert');
    const r = await b.post('/api/me/alerts', { productId: ids.out });
    assert.equal(r.status, 200);
    assert.ok(r.body.items.some((a) => a.productId === ids.out));
    const inv = await owner.get('/admin/api/inventory?level=out&per=100');
    assert.ok(inv.body.items.find((p) => p.id === ids.out)?.waiting >= 1, 'owner sees the waiting buyer');
    await owner.put(`/admin/api/inventory/${ids.out}`, { stock_quantity: 7 });
    let mail = null;
    for (let i = 0; i < 40 && !mail; i++) { await sleep(150); mail = S.outbox().find((m) => m.name.includes(`stock-${b.id}-${ids.out}`)); }
    assert.ok(mail, 'back-in-stock email written to the outbox');
    assert.match(mail.text, /back in stock/);
    assert.equal((await b.get('/api/me/alerts')).body.items.length, 0);
  });
  test('alerts need an account', async () => {
    assert.equal((await S.client().post('/api/me/alerts', { productId: ids.out })).status, 401);
  });
});
