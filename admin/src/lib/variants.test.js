import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanOptions, combinations, missingCombinations, duplicateRows, remapOptions, comboKey, comboLabel } from './variants.js';

const chair = [{ name: 'Colour', values: ['Black', 'Red', 'White'] }];
const desk = [{ name: 'Colour', values: ['Black', 'White'] }, { name: 'Dimensions', values: ['120 cm', '140 cm'] }];

test('options are saved trimmed, without empty or repeated values', () => {
  assert.deepEqual(cleanOptions([{ name: ' Colour ', values: ['Black', ' black', '', 'Red '] }, { name: '', values: ['x'] }, { name: 'Size', values: [] }]),
    [{ name: 'Colour', values: ['Black', 'Red'] }]);
});

test('every combination, in the options’ order', () => {
  assert.deepEqual(combinations(chair), [{ Colour: 'Black' }, { Colour: 'Red' }, { Colour: 'White' }]);
  assert.deepEqual(combinations(desk).map((c) => comboLabel(desk, c)), ['Black / 120 cm', 'Black / 140 cm', 'White / 120 cm', 'White / 140 cm']);
  assert.deepEqual(combinations([]), []);
});

test('only the missing combinations are added, never one that already has a row', () => {
  const rows = [{ options: { Colour: 'black', Dimensions: '120 CM' } }, { options: { Colour: 'White', Dimensions: '140 cm' } }];
  assert.deepEqual(missingCombinations(desk, rows), [{ Colour: 'Black', Dimensions: '140 cm' }, { Colour: 'White', Dimensions: '120 cm' }]);
});

test('a repeated combination is flagged on the later row', () => {
  assert.deepEqual([...duplicateRows([{ options: { Colour: 'Black' } }, { options: { Colour: 'Red' } }, { options: { colour: ' black' } }])], [2]);
  assert.equal(comboKey({ B: '2', A: '1' }), comboKey({ a: '1', b: '2' }));
});

test('renaming an option keeps each variant’s value; removing a value clears it', () => {
  const before = [{ name: 'Color', values: ['Black', 'White'] }];
  const after = [{ name: 'Colour', values: ['Black'] }];
  assert.deepEqual(remapOptions({ Color: 'Black' }, before, after), { Colour: 'Black' });
  assert.deepEqual(remapOptions({ Color: 'White' }, before, after), { Colour: '' });
});
