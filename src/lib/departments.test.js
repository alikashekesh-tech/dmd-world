import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCatalog, applyFilters, facetOptions, groupOf, PRODUCTS } from '../data/index.js';
import { DEPARTMENTS, resolveDepartment, departmentOf, nodeOptions, departmentOptions, homeOf } from '../data/departments.js';
import { resolvePath } from '../data/dmdMenu.js';

/* A small catalog shaped like /api/v1/catalog: brand product lines, console trees with "Games › New" under both PS5
   and PS4, mixed chair/desk categories, and the four categories kept out of the menus. */
const C = (id, name, slug, parent_id = null, brand_id = null, position = id) => ({ id, name, slug, parent_id, brand_id, position });
const categories = [
  C(1, 'PlayStation', 'playstation'), C(2, 'PS5', 'ps5', 1), C(3, 'Games', 'games', 2), C(4, 'New', 'new', 3), C(5, 'PS4', 'ps4', 1), C(6, 'Games', 'games', 5), C(7, 'New', 'new', 6),
  C(10, 'Nintendo Switch', 'nintendo-switch'), C(11, 'Xbox', 'xbox'), C(12, 'Laptops', 'laptops'), C(13, 'Tablets', 'tablets'), C(14, 'Electrical Appliances', 'electrical-appliances'),
  C(20, 'PC Parts', 'pc-parts'), C(21, 'Chair and Table', 'chair-and-table', 20), C(22, 'Monitors', 'monitors', 20),
  C(30, 'Other', 'other'), C(31, 'Gadgets', 'gadgets', 30), C(32, 'Phone Accessories', 'phone-accessories', 30), C(33, 'Smart Watches', 'smart-watches', 30),
  C(34, 'Network Products', 'network-products', 30), C(35, 'Action Figures', 'action-figures', 30), C(36, 'Empty Corner', 'empty-corner', 30),
  C(40, 'Headphones', 'headphones', null, 100), C(41, 'Keyboards', 'keyboards', null, 100), C(42, 'Chairs and Tables', 'chairs-and-tables', null, 100),
  C(43, 'Headsets', 'headsets', null, 101), C(44, 'Mouse', 'mouse', null, 101), C(45, 'Mouse Pads', 'mouse-pads', null, 101), C(46, 'Chairs', 'chairs', null, 101),
];
const brands = [{ id: 100, name: 'Marvo', slug: 'marvo', position: 0 }, { id: 101, name: 'Logitech', slug: 'logitech', position: 1 }];
const P = (id, cats, extra = {}) => ({ id, name: `Product ${id}`, category_ids: cats, primary_category_id: cats[0], price: 10 * id, regular_price: 10 * id, on_sale: false, availability: 'in_stock', images: [], brand_id: null, ...extra });
const products = [
  P(1, [4]), P(2, [7]), P(3, [12]), P(4, [13]), P(5, [31]),
  P(6, [40], { brand_id: 100 }), P(7, [43], { brand_id: 101 }), P(8, [41], { brand_id: 100 }), P(9, [44], { brand_id: 101 }),
  P(10, [45], { brand_id: 101 }), P(11, [46], { brand_id: 101 }), P(12, [42, 21], { brand_id: 100 }), P(13, [21]),
  P(14, [32]), P(15, [33]), P(16, [34, 31]), P(17, [35], { availability: 'out_of_stock' }), P(18, [22]),
];
applyCatalog({ generated_at: '2026-10-31T00:00:00Z', products, categories, brands, homepage: {}, store: {} });

const dept = (slug) => DEPARTMENTS.find((d) => d.slug === slug);
const sub = (d, slug) => dept(d)?.children.find((s) => s.slug === slug);
const ids = (set) => [...set].map(Number).sort((a, b) => a - b);

test('main categories come first, in order, each with its sub-categories', () => {
  assert.deepEqual(DEPARTMENTS.map((d) => d.name), ['Gaming Accessories', 'Gaming Furniture', 'Displays', 'Gaming Consoles', 'Computers', 'More Categories']);
  assert.deepEqual(dept('gaming-accessories').children.map((s) => s.name), ['Headphones & Headsets', 'Keyboards', 'Mouse', 'Mousepads']);
  assert.deepEqual(dept('gaming-consoles').children.map((s) => s.name), ['PlayStation']); // Nintendo and Xbox have nothing here: left out
});

test('a product type brings together the brands’ product lines of that name', () => {
  assert.deepEqual(ids(sub('gaming-accessories', 'headphones').ids), [6, 7]); // Marvo › Headphones + Logitech › Headsets
  assert.deepEqual(ids(sub('gaming-accessories', 'mouse').ids), [9]); // not the mouse pads
  assert.deepEqual(ids(sub('gaming-accessories', 'mousepads').ids), [10]);
  assert.deepEqual(ids(dept('gaming-accessories').ids), [6, 7, 8, 9, 10]);
});

test('chairs and desks filed together stay together, without guessing which is which', () => {
  assert.deepEqual(ids(sub('gaming-furniture', 'gaming-chairs').ids), [11]);
  assert.equal(sub('gaming-furniture', 'gaming-tables'), undefined); // no category for desks alone: not shown
  assert.deepEqual(ids(sub('gaming-furniture', 'chairs-and-tables').ids), [12, 13]);
});

test('the retired categories are never offered, but their products are kept', () => {
  const names = DEPARTMENTS.flatMap((d) => [d.name, ...d.children.map((s) => s.name)]);
  for (const gone of ['PC Parts', 'Phone Accessories', 'Smart Watches', 'Network Products']) assert.ok(!names.includes(gone), gone);
  assert.equal(PRODUCTS.length, products.length); // nothing dropped
  assert.ok(resolvePath('pc-parts') && resolvePath('other/smart-watches')); // their own pages still open (old links)
  assert.deepEqual(ids(sub('displays', 'monitors').ids), [18]); // Monitors under PC Parts still listed, under Displays
});

test('More Categories: tablets, electrical appliances and gadgets first, then the rest of "Other", without empty ones', () => {
  assert.deepEqual(dept('more').children.map((s) => s.name), ['Tablets', 'Electrical Appliances', 'Gadgets', 'Action Figures']);
  assert.equal(sub('more', 'gadgets').to, '/product-category/other/gadgets'); // an existing category keeps its own page
});

test('department URLs resolve; a category’s own path is never taken over', () => {
  assert.deepEqual(resolveDepartment('gaming-accessories/headphones').map((x) => x.slug), ['gaming-accessories', 'headphones']);
  const [d] = resolveDepartment('gaming-accessories'); // what its page reads: the shown sub-categories and its products
  assert.deepEqual(d.children.map((s) => s.slug), ['headphones', 'keyboards', 'mouse', 'mousepads']);
  assert.equal(d, dept('gaming-accessories'));
  assert.equal(resolveDepartment('gaming-consoles/playstation'), null); // PlayStation lives at /product-category/playstation
  assert.equal(resolveDepartment('gaming-accessories/nope'), null);
  assert.equal(departmentOf(resolvePath('playstation')[0]).name, 'Gaming Consoles');
});

test('sub-category filter: "New" under PS5 and under PS4 are separate options, under their own parents', () => {
  const opts = nodeOptions(resolvePath('playstation')[0], PRODUCTS);
  const flat = (os, trail = []) => os.flatMap((o) => [[...trail, o.label].join(' › '), ...flat(o.children, [...trail, o.label])]);
  assert.deepEqual(flat(opts), ['PS5', 'PS5 › Games', 'PS5 › Games › New', 'PS4', 'PS4 › Games', 'PS4 › Games › New']);
  const keys = flat(opts).length;
  assert.equal(new Set(JSON.stringify(opts).match(/"key":"[^"]+"/g)).size, keys); // every option has its own key
});

test('the Shop’s category options are the main categories with their sub-categories', () => {
  const opts = departmentOptions();
  assert.equal(opts[0].key, 'gaming-accessories');
  assert.equal(opts[0].children[0].key, 'gaming-accessories/headphones');
});

test('filters take one value per group, and groups combine', () => {
  const brand = facetOptions(PRODUCTS, {}, 'brand').map((o) => o.value).sort();
  assert.deepEqual(brand, ['logitech', 'marvo']); // only real brands: no "PlayStation", "Other" or "PC Parts" as brands
  const marvo = applyFilters(PRODUCTS, { brand: ['marvo'] });
  assert.deepEqual(marvo.map((p) => Number(p.id)).sort((a, b) => a - b), [6, 8, 12]);
  const cheapMarvo = applyFilters(PRODUCTS, { brand: ['marvo'], price: [0, 90] });
  assert.deepEqual(cheapMarvo.map((p) => Number(p.id)).sort((a, b) => a - b), [6, 8]);
  assert.deepEqual(applyFilters(PRODUCTS, { stock: ['out'] }).map((p) => Number(p.id)), [17]);
  assert.equal(applyFilters(PRODUCTS, { cat: 'anything' }).length, PRODUCTS.length); // the category is applied by the page
});

test('a product whose group is retired shows under its main category instead', () => {
  const chair = PRODUCTS.find((p) => p.id === '13'); // unbranded, filed only under PC Parts › Chair and Table
  assert.equal(homeOf(chair).name, 'Chairs & Tables');
  assert.deepEqual(groupOf(chair), { name: 'Chairs & Tables', to: '/product-category/gaming-furniture/chairs-and-tables' });
  assert.equal(groupOf(PRODUCTS.find((p) => p.id === '6')).name, 'Marvo');
});

test('Electrical Appliances is offered with no products yet, at its own address, once', () => {
  const ea = sub('more', 'electrical-appliances');
  assert.equal(ea.count, 0);
  assert.equal(ea.to, '/product-category/electrical-appliances');
  const names = DEPARTMENTS.flatMap((d) => d.children.map((s) => s.name));
  assert.equal(names.filter((n) => n === 'Electrical Appliances').length, 1);
  assert.ok(!names.includes('Empty Corner')); // other empty categories stay out of sight
});
