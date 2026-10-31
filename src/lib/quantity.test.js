// Typing a quantity: whole numbers from 1 up to what's available.
// Run with: npm run test:store
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveQty, qtyDraft, settleQty } from './quantity.js';

test('only digits are kept while typing', () => {
  assert.equal(qtyDraft('12'), '12');
  assert.equal(qtyDraft('-3'), '3');
  assert.equal(qtyDraft('2.5'), '25', 'the decimal point is dropped; the limit check that follows still applies');
  assert.equal(qtyDraft('abc'), '');
  assert.equal(qtyDraft('1e3'), '13');
  assert.equal(qtyDraft(' 4 '), '4');
  assert.equal(qtyDraft('123456'), '1234', 'four digits at most');
  assert.equal(qtyDraft(null), '');
});

test('a typed number counts as soon as it is a valid quantity', () => {
  assert.equal(liveQty('3', 7), 3);
  assert.equal(liveQty('7', 7), 7);
  assert.equal(liveQty('8', 7), null, 'more than available waits for the box to be left');
  assert.equal(liveQty('0', 7), null);
  assert.equal(liveQty('', 7), null, 'empty while typing');
  assert.equal(liveQty('12', Infinity), 12, 'untracked stock: no stock limit');
});

test('leaving the box settles the quantity', () => {
  assert.deepEqual(settleQty('', { max: 7, current: 3 }), { value: 3, limited: false }, 'empty: back to the last quantity');
  assert.deepEqual(settleQty('0', { max: 7, current: 3 }), { value: 1, limited: false }, 'zero: the minimum');
  assert.deepEqual(settleQty('5', { max: 7, current: 3 }), { value: 5, limited: false });
  assert.deepEqual(settleQty('50', { max: 7, current: 3 }), { value: 7, limited: true }, 'too many: what is available, and the buyer is told');
  assert.deepEqual(settleQty('x', { max: 7, current: 2 }), { value: 2, limited: false });
  assert.deepEqual(settleQty('9999', { current: 1 }), { value: 9999, limited: false }, 'untracked stock is not limited here');
});

test('what is already in the cart lowers the limit (the caller passes the room left)', () => {
  const stock = 7; const inCart = 5;
  assert.deepEqual(settleQty('4', { max: stock - inCart, current: 1 }), { value: 2, limited: true });
  assert.deepEqual(settleQty('3', { max: 0, current: 1 }), { value: 1, limited: true }, 'nothing left: never below 1, and said');
});

test('a smaller limit after switching variant brings the number down', () => {
  assert.deepEqual(settleQty('6', { max: 6, current: 6 }), { value: 6, limited: false });
  assert.deepEqual(settleQty('6', { max: 2, current: 6 }), { value: 2, limited: true });
});
