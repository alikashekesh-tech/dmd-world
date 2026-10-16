/* The store's time zone (Laravel config dmd.timezone, sent with the signed-in owner). Schedules are shown and picked in
   it, whatever the owner's computer is set to, and sent to the API as UTC instants. @date-fns/tz does the conversions,
   so summer time (Asia/Beirut: UTC+3 from the last Sunday of March to the last Sunday of October, UTC+2 otherwise)
   is always right for the date in question. */
import { TZDate, tzOffset } from '@date-fns/tz';

let zone = 'Asia/Beirut';
export const storeZone = () => zone;
export function setStoreZone(z) {
  if (typeof z !== 'string' || !z) return;
  try { new Intl.DateTimeFormat('en', { timeZone: z }); zone = z; } catch { /* unknown zone: keep the default */ }
}

/** Wall-clock parts in the store zone of an ISO instant: { y, m (0-11), d, h, mi }. */
export function partsOf(iso, z = zone) {
  const t = new TZDate(new Date(iso).getTime(), z);
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate(), h: t.getHours(), mi: t.getMinutes() };
}

/**
 * The UTC ISO instant of a wall-clock time in the store zone. A time that doesn't exist (skipped when clocks go
 * forward) moves to the first valid minute after it; `shifted` says so, so the form can tell the owner.
 */
export function instantOf({ y, m, d, h, mi }, z = zone) {
  const t = new TZDate(y, m, d, h, mi, 0, 0, z);
  const shifted = t.getHours() !== h || t.getMinutes() !== mi || t.getDate() !== d;
  return { iso: new Date(t.getTime()).toISOString(), shifted, at: { h: t.getHours(), mi: t.getMinutes() } };
}

/** "UTC+3" for the zone on that instant (summer or winter time). */
export function offsetLabel(iso, z = zone) {
  const min = tzOffset(z, iso ? new Date(iso) : new Date());
  const h = Math.trunc(Math.abs(min) / 60); const r = Math.abs(min) % 60;
  return `UTC${min < 0 ? '−' : '+'}${h}${r ? `:${String(r).padStart(2, '0')}` : ''}`;
}

/** "Beirut" from "Asia/Beirut". */
export const zoneCity = (z = zone) => z.split('/').pop().replace(/_/g, ' ');

const fmt = (opts, z = zone) => new Intl.DateTimeFormat('en-GB', { timeZone: z, ...opts });
/** "Fri 16 Oct 2026, 14:30" in the store zone. */
export function formatWhen(iso, z = zone) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, z).format(d)}, ${fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, z).format(d)}`;
}
/** "18 Oct 2026, 18:30" in the store zone (compact, for fields). */
export function formatShort(iso, z = zone) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmt({ day: 'numeric', month: 'short', year: 'numeric' }, z).format(d)}, ${fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, z).format(d)}`;
}
/** "16 Oct 2026" in the store zone. */
export const formatDay = (iso, z = zone) => (iso ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }, z).format(new Date(iso)) : '');

/** "6 days 9 hours", from two instants (real elapsed time, so a summer-time change is counted correctly). */
export function durationLabel(fromIso, toIso) {
  let min = Math.round((new Date(toIso) - new Date(fromIso)) / 60000);
  if (!(min > 0)) return '';
  const days = Math.floor(min / 1440); min -= days * 1440;
  const hours = Math.floor(min / 60); min -= hours * 60;
  const part = (n, w) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : null);
  return [part(days, 'day'), part(hours, 'hour'), days ? null : part(min, 'minute')].filter(Boolean).join(' ') || 'under a minute';
}
