// Offer targeting helpers: what the form sends, the summary line, and parent-category coverage.
// Run with: npm run test:admin
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveredByParent, emptyTargets, hasTargets, statusNote, targetsBody, targetsFromApi, targetsSummary, toggleTarget } from './offerTargets.js';

test('products, brands and categories mix in one offer and are sent as ids', () => {
  let t = emptyTargets();
  t = toggleTarget(t, 'products', { id: 7, name: 'Mic' });
  t = toggleTarget(t, 'brands', { id: 3, name: 'Fantech' });
  t = toggleTarget(t, 'categories', { id: 11, name: 'Headsets' });
  t = toggleTarget(t, 'products', { id: 7, name: 'Mic' }); // picking again removes
  t = toggleTarget(t, 'products', { id: 8, name: 'Mouse' });
  assert.deepEqual(targetsBody(t), { product_ids: [8], brand_ids: [3], category_ids: [11], entire_store: false });
  assert.equal(targetsSummary(t), '1 product · 1 brand · 1 category');
  assert.equal(hasTargets(t), true);
});

test('entire store is explicit, and keeps the other picks', () => {
  const t = { ...toggleTarget(emptyTargets(), 'brands', { id: 3 }), entire_store: true };
  assert.equal(targetsSummary(t), 'Entire store');
  assert.deepEqual(targetsBody(t), { product_ids: [], brand_ids: [3], category_ids: [], entire_store: true });
  assert.equal(hasTargets({ ...emptyTargets(), entire_store: true }), true);
  assert.equal(hasTargets(emptyTargets()), false);
  assert.equal(targetsSummary(emptyTargets()), 'Nothing chosen yet');
});

test('more than 40 picked products all keep their details', () => {
  const products = Array.from({ length: 57 }, (_, i) => ({ id: i + 1, name: `Product ${i + 1}`, sku: `SKU-${i + 1}`, status: 'published' }));
  const t = targetsFromApi({ products, brands: [], categories: [], entire_store: false });
  assert.equal(t.products.length, 57);
  assert.equal(t.products[56].name, 'Product 57');
  assert.equal(targetsSummary(t), '57 products');
});

test('a category inside a picked parent is reported as already included', () => {
  const all = [{ id: 1, parent: 0, name: 'Gaming' }, { id: 2, parent: 1, name: 'Headsets' }, { id: 3, parent: 2, name: 'Wireless' }, { id: 4, parent: 0, name: 'Audio' }];
  assert.deepEqual(coveredByParent([{ id: 1 }, { id: 3 }, { id: 4 }], all), { 3: 'Gaming' });
  assert.deepEqual(coveredByParent([{ id: 2 }, { id: 3 }], all), { 3: 'Headsets' });
  assert.deepEqual(coveredByParent([{ id: 3 }], all), {});
});

test('deleted, trashed and draft picks are explained, never dropped', () => {
  const t = targetsFromApi({ products: [{ id: 9, status: 'missing', name: null }, { id: 10, status: 'draft', name: 'Pad' }] });
  assert.deepEqual(targetsBody(t).product_ids, [9, 10]);
  assert.match(statusNote(t.products[0]), /Deleted/);
  assert.match(statusNote(t.products[1]), /Draft/);
  assert.match(statusNote({ status: 'trashed' }), /trash/);
  assert.equal(statusNote({ status: 'published' }), null);
});
