// Offer schedule logic: store time zone conversions (Asia/Beirut, with summer time) and the start/end rules.
// Run with: npm run test:admin
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationLabel, formatWhen, instantOf, offsetLabel, partsOf, setStoreZone, storeZone } from './zone.js';
import { scheduleProblems, scheduleSummary } from './schedule.js';

const Z = 'Asia/Beirut';
const at = (y, m, d, h, mi) => instantOf({ y, m: m - 1, d, h, mi }, Z).iso;

test('Beirut wall-clock times become the right UTC instants in summer and winter', () => {
  assert.equal(at(2026, 10, 16, 18, 0), '2026-10-16T15:00:00.000Z'); // UTC+3
  assert.equal(at(2026, 12, 1, 18, 0), '2026-12-01T16:00:00.000Z'); // UTC+2
  assert.equal(offsetLabel('2026-07-01T12:00:00Z', Z), 'UTC+3');
  assert.equal(offsetLabel('2026-01-15T12:00:00Z', Z), 'UTC+2');
});

test('UTC instants from the API show as Beirut wall-clock time, whatever the computer is set to', () => {
  assert.deepEqual(partsOf('2026-10-16T15:07:00+00:00', Z), { y: 2026, m: 9, d: 16, h: 18, mi: 7 });
  assert.deepEqual(partsOf('2026-12-31T22:30:00Z', Z), { y: 2027, m: 0, d: 1, h: 0, mi: 30 }); // already New Year in Beirut
  assert.equal(formatWhen('2026-10-16T15:00:00Z', Z), 'Fri, 16 Oct 2026, 18:00');
});

test('a time skipped when the clocks go forward moves to the first real minute, and says so', () => {
  // Beirut springs forward at 00:00 on Sunday 28 March 2027: 00:30 doesn't exist that night.
  const r = instantOf({ y: 2027, m: 2, d: 28, h: 0, mi: 30 }, Z);
  assert.equal(r.shifted, true);
  assert.deepEqual(r.at, { h: 1, mi: 30 });
  assert.equal(r.iso, '2027-03-27T22:30:00.000Z');
  assert.equal(instantOf({ y: 2027, m: 2, d: 28, h: 2, mi: 0 }, Z).shifted, false);
});

test('durations are real elapsed time across summer-time changes', () => {
  // Noon to noon over the night the clocks go back (25 October 2026) is 25 hours.
  assert.equal(durationLabel(at(2026, 10, 24, 12, 0), at(2026, 10, 25, 12, 0)), '1 day 1 hour');
  assert.equal(durationLabel(at(2027, 3, 27, 12, 0), at(2027, 3, 28, 12, 0)), '23 hours');
  assert.equal(durationLabel(at(2026, 11, 1, 9, 0), at(2026, 11, 8, 23, 59)), '7 days 14 hours');
  assert.equal(durationLabel(at(2026, 11, 1, 9, 0), at(2026, 11, 1, 9, 45)), '45 minutes');
});

test('start now and no expiration are always valid', () => {
  assert.deepEqual(scheduleProblems({ start: null, end: null }), {});
  assert.equal(scheduleSummary({ start: null, end: null }, { zone: Z }).text, 'Starts immediately and has no expiration: it runs until you switch it off.');
});

test('the end must come after the start, compared as instants', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  assert.match(scheduleProblems({ start: at(2026, 11, 2, 10, 0), end: at(2026, 11, 1, 10, 0) }, { now }).end, /must end after it starts: this end is 1 day before the start/);
  assert.match(scheduleProblems({ start: at(2026, 11, 2, 10, 0), end: at(2026, 11, 2, 10, 0) }, { now }).end, /same time/);
  assert.deepEqual(scheduleProblems({ start: at(2026, 11, 2, 10, 0), end: at(2026, 11, 2, 10, 1) }, { now }), {});
  assert.equal(scheduleSummary({ start: at(2026, 11, 2, 10, 0), end: at(2026, 11, 1, 10, 0) }, { now, zone: Z }).tone, 'bad');
});

test('a new end in the past is refused; an offer that already ended can still be edited', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  const past = '2026-10-10T09:00:00.000Z';
  assert.match(scheduleProblems({ start: null, end: past }, { now }).end, /already passed/);
  assert.deepEqual(scheduleProblems({ start: null, end: past }, { now, initial: { end: past } }), {});
});

test('the summary reads in Beirut time with the running time', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  const s = scheduleSummary({ start: at(2026, 10, 20, 9, 0), end: at(2026, 10, 27, 23, 59) }, { now, zone: Z });
  assert.equal(s.tone, 'later');
  assert.equal(s.text, 'Starts Tue, 20 Oct 2026, 09:00 and ends Tue, 27 Oct 2026, 23:59 (Beirut time) · runs 7 days 15 hours.');
});

test('an unknown time zone from the server is ignored', () => {
  setStoreZone('Not/AZone');
  assert.equal(storeZone(), 'Asia/Beirut');
});
