/* Checks and words for a schedule (an offer's start and end). Times are UTC ISO strings or null (start: immediately,
   end: no expiration); comparisons are between instants, and what the owner reads is in the store's time zone. */
import { durationLabel, formatWhen, zoneCity, storeZone } from './zone.js';

const ms = (iso) => new Date(iso).getTime();

/**
 * Problems to show beside the fields: { start?, end? } (empty when the schedule is fine).
 * `initial` is the saved schedule, so an offer that has already ended can still be edited without changing its end.
 */
export function scheduleProblems({ start, end }, { initial = {}, now = Date.now() } = {}) {
  const out = {};
  if (start && Number.isNaN(ms(start))) out.start = 'This start time isn’t a valid date.';
  if (end && Number.isNaN(ms(end))) out.end = 'This end time isn’t a valid date.';
  if (out.start || out.end) return out;
  if (start && end && ms(end) <= ms(start)) {
    out.end = ms(end) === ms(start)
      ? 'The offer must end after it starts. Both are set to the same time.'
      : `The offer must end after it starts: this end is ${durationLabel(end, start)} before the start.`;
    return out;
  }
  if (end && ms(end) <= now && end !== initial.end) {
    out.end = `This end time (${formatWhen(end)}) has already passed, so the offer would never run. Pick a later time, or choose No expiration.`;
  }
  return out;
}

/** One sentence describing when the offer runs, and its tone: ok (running), later (scheduled), ended, or bad (end before start). */
export function scheduleSummary({ start, end }, { now = Date.now(), zone = storeZone() } = {}) {
  const tz = `${zoneCity(zone)} time`;
  if (start && end && ms(end) <= ms(start)) {
    return { tone: 'bad', text: 'Fix the dates: the end must come after the start.' };
  }
  const startsLater = start && ms(start) > now;
  const from = startsLater ? `Starts ${formatWhen(start, zone)}` : start ? `Started ${formatWhen(start, zone)}` : 'Starts immediately';
  if (end && ms(end) <= now) return { tone: 'ended', text: `Ended ${formatWhen(end, zone)} (${tz}).` };
  const to = end ? `ends ${formatWhen(end, zone)} (${tz}) · runs ${durationLabel(startsLater ? start : new Date(now).toISOString(), end)}` : 'has no expiration: it runs until you switch it off';
  return { tone: startsLater ? 'later' : 'ok', text: `${from} and ${to}.` };
}
