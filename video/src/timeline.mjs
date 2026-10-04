/* Turns the chapter script + capture manifest into frame-exact timings. Used by the video and by the music
   generator (so the soundtrack is exactly as long as the film). */
import { FPS, DESK, MOBILE } from './geometry.mjs';
import { CHAPTERS } from './script.mjs';

export const INTRO = 13 * FPS;
export const OUTRO = 8 * FPS;
export const XFADE = 15; // chapters overlap by this many frames and cross-fade
const NOTE = 3.5; // seconds each explanation stays up
const s2f = (s) => Math.round(s * FPS);

export const viewHeight = (device) => (device === 'phone' ? MOBILE.cssH * MOBILE.dsf : Math.round(DESK.cssH * DESK.dsf));

/* Distance-aware scroll: short hops are quick, long scrolls glide but never drag. */
const moveFrames = (d) => s2f(Math.min(2.4, Math.max(1.0, 0.75 + d / 2600)));

function stopY(stop, meta, viewH) {
  const max = Math.max(0, meta.h - viewH);
  if (stop.y === 'top') return 0;
  if (stop.y === 'bottom') return max;
  if (typeof stop.y === 'number') return Math.min(max, stop.y);
  const r = meta.targets?.[stop.y];
  if (!r) throw new Error(`Missing target "${stop.y}"`);
  const y = stop.align === 'center' ? r.y + r.h / 2 - viewH / 2 : r.y - (stop.offset ?? 80);
  return Math.round(Math.max(0, Math.min(max, y)));
}

export function buildTimeline(manifest) {
  let globalStart = INTRO;
  const chapters = CHAPTERS.map((ch, index) => {
    const viewH = viewHeight(ch.device);
    const items = [];
    let t = 0;
    for (const shot of ch.shots) {
      const meta = manifest[shot.img];
      if (!meta) throw new Error(`Missing capture "${shot.img}"`);
      let y = 0;
      if (shot.seq) {
        const sm = manifest[shot.seq];
        items.push({ type: 'seq', img: shot.img, seq: shot.seq, frames: sm.frames, y: 0, start: t, dur: sm.frames });
        t += sm.frames;
      }
      shot.stops.forEach((stop) => {
        const ty = stopY(stop, meta, viewH);
        if (ty !== y) {
          const dur = moveFrames(Math.abs(ty - y));
          items.push({ type: 'move', img: shot.img, from: y, to: ty, start: t, dur });
          t += dur;
          y = ty;
        }
        let nt = t + s2f(stop.lead ?? 0.5);
        const notes = stop.notes.map((n) => {
          const dur = s2f(n.dur ?? NOTE);
          const it = { ...n, image: n.image || shot.img, start: nt, dur };
          nt += dur;
          return it;
        });
        const dur = nt - t + s2f(stop.tail ?? 0.5);
        items.push({ type: 'hold', img: shot.img, y, start: t, dur, notes });
        t += dur;
      });
    }
    t += s2f(0.4);
    const out = { ...ch, index, items, duration: t, start: globalStart, viewH };
    globalStart += t;
    return out;
  });
  const total = globalStart + OUTRO;
  return { chapters, total, outroStart: globalStart };
}

export const fmtTime = (frames) => {
  const s = Math.floor(frames / FPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
