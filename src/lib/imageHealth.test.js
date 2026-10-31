// Product photos that fail: skipped everywhere, never asked for again, and the chosen variant's photo still wins.
// Run with: npm run test:store
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isBroken, markBroken, photosOf, resetImageHealth, subscribeImages, imagesVersion } from './imageHealth.js';
import { withVariantImage } from './variants.js';

const P1 = 'https://dmdworld.store/wp-content/uploads/2026/02/controller-black.jpeg';
const P2 = '/storage/uploads/2026/10/white.png';
const P3 = '/storage/uploads/2026/10/red.png';
const controller = { id: '37102', name: 'MEGAVOLT CONTROLLER CALL OF DUTY', img: P1, gallery: [P1, P2, P3] };
const black = { id: '4', image: P1 };
const white = { id: '5', image: P2 };
const red = { id: '6', image: P3 };
const first = (variant) => photosOf(withVariantImage(controller, variant))[0];

beforeEach(resetImageHealth);

test('a valid variant photo is shown first', () => {
  assert.equal(first(white), P2);
  assert.equal(first(red), P3);
  assert.deepEqual(photosOf(withVariantImage(controller, white)), [P2, P1, P3]);
});

test('a variant photo that fails falls back to the first product photo that works', () => {
  markBroken(P2);
  assert.equal(first(white), P1);
  markBroken(P1);
  assert.equal(first(white), P3, 'the next working photo');
  assert.deepEqual(photosOf(controller), [P3], 'thumbnails skip failed photos too');
});

test('no working photo at all: an empty list (the page shows a placeholder)', () => {
  [P1, P2, P3].forEach(markBroken);
  assert.deepEqual(photosOf(withVariantImage(controller, red)), []);
  assert.deepEqual(photosOf({ ...controller, gallery: [] }), []);
  assert.deepEqual(photosOf({ name: 'No photo' }), [], 'a product without photos keeps its drawing');
});

test('switching variants back and forth always shows the chosen one', () => {
  markBroken(P2);
  const seen = [black, white, red, white, black, red, black].map(first);
  assert.deepEqual(seen, [P1, P1, P3, P1, P1, P3, P1]);
});

test('a late failure from the previous variant never replaces the one now chosen', () => {
  // White chosen, then Black, then White's photo reports its failure.
  assert.equal(first(white), P2);
  assert.equal(first(black), P1);
  markBroken(P2);
  assert.equal(first(black), P1, 'Black stays');
  assert.equal(first(white), P1, 'White now falls back');
});

test('a failure is recorded once: no repeated requests or re-renders for the same address', () => {
  let calls = 0;
  const stop = subscribeImages(() => { calls++; });
  const v = imagesVersion();
  markBroken(P3); markBroken(P3); markBroken(''); markBroken(null);
  stop();
  assert.equal(calls, 1);
  assert.equal(imagesVersion(), v + 1);
  assert.ok(isBroken(P3) && !isBroken(P1));
});

test('blank and repeated addresses are left out', () => {
  assert.deepEqual(photosOf({ img: P1, gallery: [P1, '', '  ', P1, null, P2] }), [P1, P2]);
});
