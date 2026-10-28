// "View in your room": when the button shows, and the two-finger gesture maths.
// Run with: npm run test:store
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraProblem, canViewInRoom, clampScale, MAX_SCALE, MIN_SCALE, pinch } from './roomView.js';

test('the button shows only on a secure touch screen that can open a camera', () => {
  assert.equal(canViewInRoom({ secure: true, camera: true, touch: true }), true);
  assert.equal(canViewInRoom({ secure: false, camera: true, touch: true }), false); // plain http: the browser has no camera API
  assert.equal(canViewInRoom({ secure: true, camera: false, touch: true }), false); // old browser, or an in-app browser without it
  assert.equal(canViewInRoom({ secure: true, camera: true, touch: false }), false); // laptop: the webcam faces the shopper
  assert.equal(canViewInRoom({}), false);
});

test('spreading two fingers apart scales by the change in the gap between them', () => {
  const r = pinch([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  assert.equal(r.scale, 2);
  assert.equal(r.turn, 0);
  assert.equal(pinch([{ x: 50, y: 50 }, { x: 50, y: 50 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]).scale, 1); // fingers on one spot: no jump
});

test('turning two fingers turns the product the shorter way round', () => {
  assert.equal(pinch([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 100 }]).turn, 90);
  const across = pinch([{ x: 0, y: 0 }, { x: -100, y: 1 }], [{ x: 0, y: 0 }, { x: -100, y: -1 }]); // crosses the ±180° line
  assert.ok(Math.abs(across.turn) < 2);
});

test('the size stays between a quarter and four times the starting size', () => {
  assert.equal(clampScale(10), MAX_SCALE);
  assert.equal(clampScale(0.01), MIN_SCALE);
  assert.equal(clampScale(1.5), 1.5);
});

test('camera errors read as something the shopper can do', () => {
  assert.match(cameraProblem({ name: 'NotAllowedError' }), /Allow the camera/);
  assert.match(cameraProblem({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraProblem(new Error('x')), /could not be opened/);
});
