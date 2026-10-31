import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDiscounted, weeklyOffers, firstEnd } from './offers.js';

const NOW = Date.parse('2026-11-02T10:00:00Z');
const P = (id, price, was, extra = {}) => ({ id: String(id), price, was, discount: was ? Math.round(100 - (price * 100) / was) : 0, stock: 'in', saleEndsAt: null, offer: null, ...extra });
const products = [
  P(1, 80, 100, { offer: { id: 7, label: 'Weekly' }, saleEndsAt: '2026-11-08T21:59:00Z' }), // 20 % in the weekly offer
  P(2, 50, 100, { offer: { id: 7, label: 'Weekly' }, saleEndsAt: '2026-11-05T21:59:00Z' }), // 50 % in the weekly offer
  P(3, 30, 60), // its own sale, no offer
  P(4, 20, 40, { offer: { id: 7 }, stock: 'out' }), // sold out
  P(5, 10, 20, { offer: { id: 7 }, saleEndsAt: '2026-11-01T00:00:00Z' }), // ended
  P(6, 25, null), // not discounted
];
const byId = (id) => products.find((p) => p.id === id) || null;

test('a product counts as on offer only while it is cheaper, in stock and before its end', () => {
  assert.deepEqual(products.map((p) => isDiscounted(p, NOW)), [true, true, true, false, false, false]);
});

test('the products in a running offer come first, deepest discount first', () => {
  assert.deepEqual(weeklyOffers(products, [], { now: NOW, byId }).map((p) => p.id), ['2', '1']);
});

test('the owner’s picks win, in their order, while they’re discounted', () => {
  assert.deepEqual(weeklyOffers(products, [3, 6, 1, 4], { now: NOW, byId }).map((p) => p.id), ['3', '1']);
});

test('with no running offer, products on their own sale fill the section', () => {
  const noOffers = products.map((p) => ({ ...p, offer: null }));
  assert.deepEqual(weeklyOffers(noOffers, [], { now: NOW, byId }).map((p) => p.id), ['2', '3', '1']);
});

test('nothing on offer: an empty section (it hides itself)', () => {
  assert.deepEqual(weeklyOffers([P(1, 25, null)], [], { now: NOW }), []);
});

test('the section says when the first offer ends', () => {
  assert.equal(firstEnd(weeklyOffers(products, [], { now: NOW, byId })), '2026-11-05T21:59:00Z');
  assert.equal(firstEnd([P(3, 30, 60)]), null);
});
