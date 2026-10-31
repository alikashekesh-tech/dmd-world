import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validMeasurementId, toItem, valueOf, firstPurchase, CURRENCY } from './analytics.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('only a real GA4 Measurement ID turns analytics on', () => {
  assert.equal(validMeasurementId('G-AB12CD34EF'), true);
  assert.equal(validMeasurementId(' G-AB12CD34EF '), true);
  for (const bad of ['', null, 'UA-1234-1', 'G-', 'G-ab12', 'https://evil.example/x.js', 'G-AB12"><script>']) assert.equal(validMeasurementId(bad), false, bad);
});

test('items carry shop data only, in USD, with the variant chosen', () => {
  const chair = { id: 12, name: 'Gaming Chair', price: 150, brandName: 'Megavolt', email: 'x@y.z' };
  const red = { id: 40, price: 135, options: { Colour: 'Red' } };
  assert.equal(CURRENCY, 'USD');
  assert.deepEqual(toItem(chair, { variant: red, qty: 2, list: 'Chairs', index: 0 }), { item_id: '12', item_name: 'Gaming Chair', price: 135, quantity: 2, item_variant: 'Red', item_brand: 'Megavolt', item_list_name: 'Chairs', index: 0 });
  assert.equal(valueOf([toItem(chair, { variant: red, qty: 2 }), toItem({ id: 1, name: 'Mouse', price: 15.5 })]), 285.5);
});

test('a purchase is reported once per order, even after a reload', () => {
  const store = memory();
  assert.equal(firstPurchase(101, store), true);
  assert.equal(firstPurchase('101', store), false);
  assert.equal(firstPurchase(102, store), true);
});
