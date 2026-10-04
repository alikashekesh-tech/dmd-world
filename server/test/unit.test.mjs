// Unit tests for pure helpers (no servers). Run: npm --prefix server test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { couponDiscount, parseReview } from '../buyer.mjs';
import { passwordError, checkPassword } from '../../shared/passwordPolicy.js';
import { writeJsonAtomic, readJson } from '../lib/files.mjs';
import { serveSpa } from '../lib/http.mjs';
import { idParam, plainText, httpUrl, safeCookies, limiter } from '../lib/security.mjs';
import { verifyPassword, hashPassword, createSessions, createDeviceTrust, loginAllowed } from '../lib/auth.mjs';

const P = (id, cats = [], extra = {}) => ({ id, categories: cats.map((c) => ({ id: c })), on_sale: false, ...extra });
const line = (p, price, qty = 1) => ({ p, price, qty });
const catsOf = (p) => p.categories.map((c) => c.id);
const coupon = (o) => ({ status: 'publish', amount: '10', discount_type: 'percent', product_ids: [], product_categories: [], excluded_product_ids: [], excluded_product_categories: [], minimum_amount: '0', maximum_amount: '0', usage_limit: null, usage_count: 0, ...o });

describe('coupons', () => {
  test('percent off the covered items only', () => {
    const r = couponDiscount(coupon({ product_categories: [5] }), [line(P(1, [5]), 40), line(P(2, [9]), 100)], { catsOf });
    assert.equal(r.discount, 4);
  });
  test('fixed cart discount never exceeds the cart', () => {
    assert.equal(couponDiscount(coupon({ discount_type: 'fixed_cart', amount: '50' }), [line(P(1), 20)], { catsOf }).discount, 20);
  });
  test('fixed product discount per unit, capped at the price', () => {
    assert.equal(couponDiscount(coupon({ discount_type: 'fixed_product', amount: '5' }), [line(P(1), 3, 2), line(P(2), 30, 1)], { catsOf }).discount, 11);
  });
  test('expired, used up, minimum and maximum spend, not applicable', () => {
    const lines = [line(P(1, [5]), 15)];
    assert.match(couponDiscount(coupon({ date_expires: '2000-01-01T00:00:00' }), lines, { catsOf }).problem, /expired/);
    assert.match(couponDiscount(coupon({ usage_limit: 3, usage_count: 3 }), lines, { catsOf }).problem, /used up/);
    assert.match(couponDiscount(coupon({ minimum_amount: '20' }), lines, { catsOf }).problem, /at least \$20\.00/);
    assert.match(couponDiscount(coupon({ maximum_amount: '10' }), lines, { catsOf }).problem, /up to \$10\.00/);
    assert.match(couponDiscount(coupon({ product_ids: [99] }), lines, { catsOf }).problem, /doesn’t apply/);
    assert.match(couponDiscount(coupon({ status: 'draft' }), lines, { catsOf }).problem, /isn’t valid/);
    assert.match(couponDiscount(null, lines, { catsOf }).problem, /isn’t valid/);
  });
  test('once per customer', () => {
    const c = coupon({ usage_limit_per_user: 1, used_by: ['ana@example.com'] });
    assert.match(couponDiscount(c, [line(P(1), 30)], { catsOf, email: 'ANA@example.com' }).problem, /already used/);
    assert.equal(couponDiscount(c, [line(P(1), 30)], { catsOf, email: 'bo@example.com' }).discount, 3);
  });
  test('excluded items block a fixed cart coupon; sale items can be excluded', () => {
    assert.match(couponDiscount(coupon({ discount_type: 'fixed_cart', excluded_product_ids: [2] }), [line(P(1), 30), line(P(2), 10)], { catsOf }).problem, /can’t be used/);
    assert.match(couponDiscount(coupon({ exclude_sale_items: true }), [line(P(1, [], { on_sale: true }), 30)], { catsOf }).problem, /doesn’t apply/);
  });
});

describe('reviews', () => {
  test('title and text come back out of WooCommerce HTML', () => {
    assert.deepEqual(parseReview('<p><strong>Solid &amp; quiet</strong><br />\nLoved it.</p>'), { title: 'Solid & quiet', text: 'Loved it.' });
    assert.deepEqual(parseReview('<p>No title here</p>'), { title: null, text: 'No title here' });
  });
});

describe('password policy', () => {
  test('rules', () => {
    for (const bad of ['Sh0rt!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbers!!', 'NoSpecial123', '']) assert.ok(passwordError(bad), bad);
    assert.equal(passwordError('Sh0rt!Ok'), null, 'exactly 8 characters is enough');
    assert.equal(passwordError('Good-Pass-1'), null);
    assert.ok(checkPassword('abc').some((r) => !r.ok) && checkPassword('Good-Pass-1').every((r) => r.ok));
    assert.ok(passwordError('A1!a'.repeat(40)), 'too long');
  });
  test('hashing round trip and wrong passwords', () => {
    const h = hashPassword('Owner-Pass-1!');
    assert.equal(verifyPassword('Owner-Pass-1!', h), true);
    assert.equal(verifyPassword('owner-pass-1!', h), false);
    assert.equal(verifyPassword('x', 'garbage'), false);
  });
});

describe('sessions and devices', () => {
  test('signed owner sessions end on logout and when the key changes', () => {
    let key = 'k1';
    const revoked = new Set();
    const s = createSessions(() => key, 1, { isRevoked: (n) => revoked.has(n), revoke: (n) => revoked.add(n) });
    const t = s.issue();
    assert.equal(s.valid(t), true);
    assert.equal(s.valid(`${t}x`), false);
    key = 'k2'; // password changed
    assert.equal(s.valid(t), false);
    key = 'k1';
    s.end(t);
    assert.equal(s.valid(t), false);
  });
  test('known devices skip the store-wide brake but not the per-address limit', () => {
    const trust = createDeviceTrust(() => 'secret');
    const t = trust.issue();
    assert.equal(trust.valid(t), true);
    assert.equal(trust.valid(t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), false);
    assert.equal(createDeviceTrust(() => 'other').valid(t), false);
    assert.equal(typeof loginAllowed('1.2.3.4', true), 'boolean');
  });
});

describe('input guards', () => {
  test('ids, text, urls, cookies', () => {
    assert.equal(idParam('42'), 42);
    for (const bad of ['0', '-1', '1.5', 'abc', '1/2', '9'.repeat(20)]) assert.throws(() => idParam(bad));
    assert.equal(plainText('<b>Hi</b>\u0000 there', 50), 'Hi there');
    assert.throws(() => httpUrl('javascript:alert(1)'));
    assert.equal(httpUrl('https://x.test/a.png'), 'https://x.test/a.png');
    assert.deepEqual({ ...safeCookies('a=1; b=%E0%A4%A; c=%20x') }, { a: '1', c: ' x' });
  });
  test('limiter stays bounded', () => {
    const l = limiter(2, 60e3, 100);
    for (let i = 0; i < 1000; i++) l.add(`ip-${i}`);
    assert.equal(l.hit('fresh'), true);
    assert.equal(l.hit('fresh'), true);
    assert.equal(l.hit('fresh'), false);
  });
});

describe('files', () => {
  test('atomic JSON writes and recovery from a corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dmd-unit-'));
    const f = join(dir, 'state.json');
    writeJsonAtomic(f, { a: 1 });
    assert.deepEqual(readJson(f, null), { a: 1 });
    writeFileSync(f, '{"broken":');
    const warnings = [];
    assert.deepEqual(readJson(f, { fresh: true }, (m) => warnings.push(m)), { fresh: true });
    assert.equal(warnings.length, 1);
    assert.ok(readdirSync(dir).some((n) => n.includes('.corrupt-')), 'the broken file is kept aside');
    assert.equal(readFileSync(f, 'utf8'), '{"broken":', 'and the original is left untouched');
  });
  test('the storefront file server stays inside its folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dmd-spa-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>shop</title>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, '..', 'secret.txt'), 'nope');
    const res = () => { const r = { status: 0, headers: null, body: null, writeHead(s, h) { r.status = s; r.headers = h; }, end(b) { r.body = b; } }; return r; };
    const req = { headers: {} };
    let r = res(); assert.equal(serveSpa(req, r, dir, '/product/123'), true); assert.match(String(r.body), /shop/);
    r = res(); assert.equal(serveSpa(req, r, dir, '/assets/app.js'), true); assert.match(r.headers['Cache-Control'], /immutable/);
    r = res(); assert.equal(serveSpa(req, r, dir, '/assets/missing.js'), false, 'missing assets are a 404, not HTML');
    for (const evil of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/%00index.html']) { r = res(); assert.notEqual(String(r.body || ''), 'nope', evil); serveSpa(req, r, dir, evil); assert.notEqual(String(r.body || ''), 'nope', evil); }
  });
});
