import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionOf, findVariant, missingOptions, choicesFor, chooseOption, initialSelection, optionList, variantLabel, lineRef, isVariable, lineDetails, withVariantImage } from './variants.js';

/* A gaming desk in two colours and three widths, not every combination sold; the white 160 cm one sold out. */
const V = (id, Colour, Width, stock = 'in', price = 100) => ({ id: String(id), options: { Colour, Width }, stock, price });
const desk = {
  id: '9',
  attributes: [{ name: 'Colour', values: ['Black', 'White'] }, { name: 'Width', values: ['120 cm', '140 cm', '160 cm'] }],
  variants: [V(1, 'Black', '120 cm'), V(2, 'Black', '140 cm', 'in', 140), V(3, 'White', '140 cm'), V(4, 'White', '160 cm', 'out')],
};

test('a variant is found only once every option is chosen, whatever the case', () => {
  assert.equal(findVariant(desk, { Colour: 'Black' }), null);
  assert.equal(findVariant(desk, { Colour: 'black', Width: '140 CM' }).id, '2');
  assert.equal(findVariant(desk, { Colour: 'Black', Width: '160 cm' }), null); // not sold in that combination
  assert.deepEqual(missingOptions(desk, { Colour: 'White' }), ['Width']);
});

test('the choices say what can still be bought with the other options picked', () => {
  const widths = choicesFor(desk, { Colour: 'White' }, 'Width');
  assert.deepEqual(widths, [
    { value: '120 cm', offered: false, inStock: false },
    { value: '140 cm', offered: true, inStock: true },
    { value: '160 cm', offered: true, inStock: false }, // offered but sold out
  ]);
  assert.deepEqual(choicesFor(desk, {}, 'Colour').map((c) => [c.value, c.offered, c.inStock]), [['Black', true, true], ['White', true, true]]);
});

test('choosing a value keeps the other choices that still fit and clears the one that doesn’t', () => {
  assert.deepEqual(chooseOption(desk, { Colour: 'Black' }, 'Width', '140 cm'), { Colour: 'Black', Width: '140 cm' });
  assert.deepEqual(chooseOption(desk, { Colour: 'Black', Width: '120 cm' }, 'Colour', 'White'), { Colour: 'White' }); // no white 120 cm
  assert.deepEqual(chooseOption(desk, { Colour: 'Black', Width: '140 cm' }, 'Colour', 'White'), { Colour: 'White', Width: '140 cm' });
});

test('a value no variant uses is not offered at all', () => {
  const p = { attributes: [{ name: 'Colour', values: ['Black', 'Pink'] }], variants: [{ id: '1', options: { Colour: 'Black' }, stock: 'in' }] };
  assert.deepEqual(choicesFor(p, {}, 'Colour').map((c) => c.value), ['Black']);
  assert.deepEqual(initialSelection(p), { Colour: 'Black' }); // the only value is chosen for the buyer
  assert.deepEqual(initialSelection(desk), {}); // otherwise the buyer chooses
});

test('a link to one variant opens with its options chosen', () => {
  assert.deepEqual(initialSelection(desk, '4'), { Colour: 'White', Width: '160 cm' }); // the sold-out one a buyer waited for
  assert.deepEqual(initialSelection(desk, 4), { Colour: 'White', Width: '160 cm' });
  assert.deepEqual(initialSelection(desk, '99'), {}); // no longer sold: the buyer chooses
});

test('labels follow the product’s option order', () => {
  assert.deepEqual(optionList(desk, desk.variants[2]), [['Colour', 'White'], ['Width', '140 cm']]);
  assert.equal(variantLabel(desk, desk.variants[2]), 'White / 140 cm');
  assert.equal(variantLabel({ attributes: [] }, null), '');
  assert.ok(isVariable(desk) && !isVariable({ attributes: [], variants: [] }));
});

test('conditions read the same everywhere', () => {
  assert.deepEqual(conditionOf({ condition: 'excellent' }), { key: 'excellent', label: 'Excellent', description: 'Light signs of use that are hard to spot.' });
  assert.equal(conditionOf({ used: true }).label, 'Used'); // filed under a "Used" category without a grade
  assert.equal(conditionOf({ condition: null }), null);
  assert.equal(conditionOf({ condition: 'mint' }), null);
});

test('a cart line and the server’s line meet on product and variant', () => {
  assert.equal(lineRef('12', '40'), '12:40');
  assert.equal(lineRef(12, null), '12:');
  assert.notEqual(lineRef('12', '40'), lineRef('12', '41'));
});

test('a cart line describes its options and a used item’s condition', () => {
  assert.equal(lineDetails({ options: [['Colour', 'Black'], ['Width', '140 cm']], product: {} }), 'Black · 140 cm');
  assert.equal(lineDetails({ options: [], product: { condition: 'good' } }), 'Used · Good');
  assert.equal(lineDetails({ product: { used: true } }), 'Used');
});

test('a variant with its own photo shows it first', () => {
  const p = { img: 'a.jpg', gallery: ['a.jpg', 'w.jpg'] };
  assert.deepEqual(withVariantImage(p, { image: 'w.jpg' }).gallery, ['w.jpg', 'a.jpg']);
  assert.equal(withVariantImage(p, { image: null }), p);
});
