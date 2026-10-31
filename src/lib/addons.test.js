import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addonsFor } from './addons.js';

const P = (id, extra = {}) => ({ id: String(id), name: `P${id}`, stock: 'in', addons: [], ...extra });
const catalog = [P(1, { addons: ['2', '3', '4', '9', '5'] }), P(2), P(3, { stock: 'out' }), P(4, { attributes: [{ name: 'Colour', values: ['Black'] }] }), P(5), P(6, { addons: ['5', '2', '7'] }), P(7)];
const byId = (id) => catalog.find((p) => p.id === id);

test('the owner’s picks in order, without sold-out or unknown products', () => {
  assert.deepEqual(addonsFor([byId('1')], { byId }).map((a) => a.product.id), ['2', '4', '5']);
});

test('a product sold in options is offered as a link to choose them', () => {
  assert.deepEqual(addonsFor([byId('1')], { byId }).map((a) => a.needsOptions), [false, true, false]);
});

test('in the cart: nothing already in it, no duplicates across products, and a limit', () => {
  const cart = [byId('1'), byId('6')];
  assert.deepEqual(addonsFor(cart, { byId, inCart: ['1', '6', '5'] }).map((a) => a.product.id), ['2', '4', '7']);
  assert.deepEqual(addonsFor(cart, { byId, inCart: ['1', '6'], limit: 2 }).map((a) => a.product.id), ['2', '4']);
});

test('a product never recommends itself and nothing comes without picks', () => {
  assert.deepEqual(addonsFor([P(8, { addons: ['8'] })], { byId: (id) => (id === '8' ? P(8) : undefined) }), []);
  assert.deepEqual(addonsFor([byId('2')], { byId }), []);
});
