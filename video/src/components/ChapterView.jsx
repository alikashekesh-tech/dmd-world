import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { BROWSER, PHONE, MOBILE } from '../geometry.mjs';
import { C, SORA, INTER, MONO } from '../theme.js';
import Note from './Note.jsx';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const scrollEase = Easing.bezier(0.45, 0, 0.2, 1);
const pad2 = (n) => String(n).padStart(2, '0');

/* Where the page shows, and how many video px one capture px is. */
function geometry(device) {
  if (device === 'phone') {
    const b = PHONE.bezel;
    return { view: { x: PHONE.x + b, y: PHONE.y + b, w: PHONE.w - b * 2, h: PHONE.h - b * 2, r: PHONE.radius - b }, k: MOBILE.scale, bounds: { x: PHONE.x + PHONE.w + 10, y: 60, w: 1920 - (PHONE.x + PHONE.w) - 90, h: 960 } };
  }
  const view = { x: BROWSER.x, y: BROWSER.y + BROWSER.bar, w: BROWSER.w, h: BROWSER.h - BROWSER.bar, r: 0 };
  return { view, k: 1, bounds: view };
}

/* Everything visible at local frame f: which image(s), at what scroll, and which note. */
function stateAt(ch, f) {
  const items = ch.items;
  let idx = items.findIndex((it) => f >= it.start && f < it.start + it.dur);
  if (idx < 0) idx = f < 0 ? 0 : items.length - 1;
  const it = items[idx];
  let y = it.y ?? 0;
  if (it.type === 'move') y = it.from + (it.to - it.from) * scrollEase(clamp01((f - it.start) / it.dur));
  const layers = [];
  const prev = items[idx - 1];
  const base = (item, ff) => (item.type === 'seq'
    ? { src: `seq/${item.seq}/${String(Math.max(0, Math.min(item.frames - 1, ff - item.start))).padStart(4, '0')}.jpg`, meta: item.seq, y: 0 }
    : { src: `shots/${item.img}.jpg`, meta: item.img, y: item.type === 'move' ? (ff >= item.start + item.dur ? item.to : y) : item.y });
  // A new shot (or the switch from the live clip to the still) cross-fades in over the previous one.
  const cur = base(it, f);
  const curKey = it.type === 'seq' ? it.seq : it.img;
  const prevKey = prev && (prev.type === 'seq' ? prev.seq : prev.img);
  if (prev && prevKey !== curKey && f - it.start < 12) {
    layers.push({ ...base(prev, prev.start + prev.dur - 1), y: prev.type === 'move' ? prev.to : prev.y ?? 0, opacity: 1 });
    layers.push({ ...cur, y, opacity: clamp01((f - it.start) / 12) });
  } else {
    layers.push({ ...cur, y, opacity: 1 });
  }
  // A note can swap in an alternate capture of the same page (hover state, another platform, a different budget).
  const notes = [];
  if (it.type === 'hold') {
    it.notes.forEach((n, i) => {
      const nf = f - n.start;
      if (nf >= 0 && nf < n.dur) notes.push({ ...n, nf, key: `${idx}-${i}` });
      if (n.image !== it.img && nf > -12 && nf < n.dur + 12) {
        const o = Math.min(clamp01((nf + 12) / 14), clamp01((n.dur + 12 - nf) / 14));
        layers.push({ src: `shots/${n.image}.jpg`, meta: n.image, y: it.y, opacity: o });
      }
    });
  }
  return { y, layers, notes };
}

function BrowserChrome({ ch, count, children }) {
  return (
    <div style={{ position: 'absolute', left: BROWSER.x, top: BROWSER.y, width: BROWSER.w, height: BROWSER.h, borderRadius: 18, overflow: 'hidden', background: '#f4f6fa', boxShadow: '0 50px 120px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(159,178,214,0.22)' }}>
      <div style={{ position: 'relative', height: BROWSER.bar, display: 'flex', alignItems: 'center', gap: 18, padding: '0 20px', background: C.ink2, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', gap: 8 }}>{['#ff6b57', '#ffc23d', '#3ccf6e'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }} />)}</div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 18px', borderRadius: 9, background: 'rgba(159,178,214,0.08)', border: `1px solid ${C.line}`, fontFamily: MONO, fontSize: 15, color: C.text2, minWidth: 520, justifyContent: 'center' }}>
          <svg width="12" height="14" viewBox="0 0 12 14"><path d="M2 6V4a4 4 0 0 1 8 0v2M1 6h10v7H1z" fill="none" stroke={C.led} strokeWidth="1.6" /></svg>
          <span style={{ color: C.text }}>dmdworld.store</span><span>{ch.path === '/' ? '' : ch.path}</span>
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber }}>
          {pad2(ch.index + 1)} / {pad2(count)} · {ch.title}
        </div>
      </div>
      {children}
    </div>
  );
}

function PhoneChrome({ children }) {
  return (
    <>
      <div style={{ position: 'absolute', left: PHONE.x, top: PHONE.y, width: PHONE.w, height: PHONE.h, borderRadius: PHONE.radius, background: '#0b1220', boxShadow: '0 60px 120px -30px rgba(0,0,0,0.9), 0 0 0 2px #24304a inset, 0 0 0 1px rgba(159,178,214,0.25)' }} />
      <div style={{ position: 'absolute', left: PHONE.x - 3, top: PHONE.y + 180, width: 4, height: 70, borderRadius: 3, background: '#24304a' }} />
      <div style={{ position: 'absolute', left: PHONE.x + PHONE.w - 1, top: PHONE.y + 220, width: 4, height: 110, borderRadius: 3, background: '#24304a' }} />
      {children}
      <div style={{ position: 'absolute', left: PHONE.x + PHONE.w / 2 - 56, top: PHONE.y + 30, width: 112, height: 32, borderRadius: 18, background: '#05080f' }} />
    </>
  );
}

function Caption({ ch, count, f, end, device }) {
  const a = interpolate(f, [6, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  const b = interpolate(f, [end - 14, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const o = Math.min(a, b);
  if (o <= 0) return null;
  const phone = device === 'phone';
  const style = phone
    ? { left: PHONE.x + PHONE.w + 110, top: 380 }
    : { left: BROWSER.x + 44, top: BROWSER.y + BROWSER.h - 44, transform: `translateY(calc(-100% + ${(1 - a) * 24}px))` };
  return (
    <div style={{ position: 'absolute', ...style, opacity: o, padding: phone ? 0 : '26px 32px 28px', borderRadius: 22, background: phone ? 'none' : 'rgba(6,10,19,0.9)', border: phone ? 'none' : `1px solid ${C.line}`, boxShadow: phone ? 'none' : '0 40px 80px -30px rgba(0,0,0,0.8)', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.hud }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
        Chapter {pad2(ch.index + 1)} / {pad2(count)}
      </div>
      <div style={{ marginTop: 12, fontFamily: SORA, fontWeight: 800, fontSize: phone ? 88 : 64, lineHeight: 1, letterSpacing: '-0.04em', color: C.text }}>{ch.title}</div>
      <div style={{ marginTop: 14, fontFamily: INTER, fontSize: 26, color: C.text2 }}>{ch.blurb}</div>
    </div>
  );
}

export default function ChapterView({ ch, manifest, count }) {
  const f = useCurrentFrame();
  const { view, k, bounds } = geometry(ch.device);
  const st = stateAt(ch, f);
  const firstHold = ch.items.find((i) => i.type === 'hold');
  const captionEnd = Math.min(firstHold.notes[0].start - 4, 30 * 4.4);

  const page = (
    <div style={{ position: 'absolute', left: view.x - (ch.device === 'phone' ? 0 : BROWSER.x), top: view.y - (ch.device === 'phone' ? 0 : BROWSER.y), width: view.w, height: view.h, overflow: 'hidden', borderRadius: view.r, background: '#f4f6fa' }}>
      {st.layers.map((l, i) => {
        const meta = manifest[l.meta];
        return (
          <Img key={`${l.src}-${i}`} src={staticFile(l.src)}
            style={{ position: 'absolute', left: 0, top: 0, width: meta.w * k, height: meta.h * k, transform: `translateY(${-l.y * k}px)`, opacity: l.opacity }} />
        );
      })}
    </div>
  );

  return (
    <AbsoluteFill>
      {ch.device === 'phone' ? <PhoneChrome>{page}</PhoneChrome> : <BrowserChrome ch={ch} count={count}>{page}</BrowserChrome>}
      {st.notes.map((n) => {
        // A note may name several targets (e.g. an object and its tooltip); the loop goes around all of them.
        const rs = [].concat(n.target).map((key) => manifest[n.image]?.targets?.[key]).filter(Boolean);
        if (!rs.length) return null;
        const x0 = Math.min(...rs.map((q) => q.x)), y0 = Math.min(...rs.map((q) => q.y));
        const r = { x: x0, y: y0, w: Math.max(...rs.map((q) => q.x + q.w)) - x0, h: Math.max(...rs.map((q) => q.y + q.h)) - y0 };
        const rect = { x: view.x + r.x * k, y: view.y + (r.y - st.y) * k, w: r.w * k, h: r.h * k };
        return <Note key={n.key} index={n.key} rect={rect} clip={view} bounds={bounds} f={n.nf} dur={n.dur} title={n.title} text={n.text} label={ch.title} />;
      })}
      <Caption ch={ch} count={count} f={f} end={captionEnd} device={ch.device} />
    </AbsoluteFill>
  );
}
