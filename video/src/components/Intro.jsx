import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, SORA, INTER, MONO } from '../theme.js';
import { fmtTime } from '../timeline.mjs';

const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const rise = (f, at, dist = 24) => {
  const p = interpolate(f, [at, at + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

/* Opening slide: what this is, and a timestamp for every page the video covers. */
export default function Intro({ chapters, total, videoTotal }) {
  const f = useCurrentFrame();
  const fadeOut = interpolate(f, [total - 20, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const half = Math.ceil(chapters.length / 2);
  const cols = [chapters.slice(0, half), chapters.slice(half)];
  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <div style={{ position: 'absolute', left: 120, top: 150, width: 700 }}>
        <div style={{ ...rise(f, 6), display: 'inline-flex', alignItems: 'center', padding: '10px 16px', borderRadius: 14, background: '#fff' }}>
          <Img src={staticFile('dmd-world-logo.png')} style={{ height: 54, width: 'auto' }} />
        </div>
        <div style={{ ...rise(f, 14), marginTop: 46, display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.hud }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: C.led, boxShadow: `0 0 14px ${C.led}` }} />
          Website showcase
        </div>
        <div style={{ ...rise(f, 20, 30), marginTop: 22, fontFamily: SORA, fontWeight: 800, fontSize: 132, lineHeight: 0.95, letterSpacing: '-0.05em', color: C.text }}>
          DMD World
        </div>
        <div style={{ ...rise(f, 30), marginTop: 30, fontFamily: INTER, fontSize: 31, lineHeight: 1.45, color: C.text2, maxWidth: 640 }}>
          A guided tour of the redesigned store: every page, what’s on it, and why it works that way.
        </div>
        <div style={{ ...rise(f, 40), marginTop: 46, display: 'flex', gap: 34 }}>
          {[['Pages', chapters.length - 1], ['Length', fmtTime(videoTotal)], ['Design', 'Press Start']].map(([k, v]) => (
            <div key={k} style={{ paddingLeft: k === 'Pages' ? 0 : 34, borderLeft: k === 'Pages' ? 'none' : `1px solid ${C.line}` }}>
              <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 40, letterSpacing: '-0.03em', color: C.text }}>{v}</div>
              <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 15, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 900, top: 136, right: 110 }}>
        <div style={{ ...rise(f, 34), display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 18, borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.amber }}>In this video</span>
          <span style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Timestamps</span>
        </div>
        <div style={{ display: 'flex', gap: 40, marginTop: 22 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
              {col.map((ch, i) => {
                const n = ci * half + i;
                return (
                  <div key={ch.id} style={{ ...rise(f, 46 + n * 5, 16), display: 'grid', gridTemplateColumns: '70px 1fr', alignItems: 'baseline', padding: '12px 16px', borderRadius: 14, background: 'rgba(12,20,36,0.7)', border: `1px solid ${C.line}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 21, fontWeight: 700, color: C.amber }}>{fmtTime(ch.start)}</span>
                    <span>
                      <span style={{ display: 'block', fontFamily: SORA, fontWeight: 700, fontSize: 25, letterSpacing: '-0.02em', color: C.text }}>{ch.title}</span>
                      <span style={{ display: 'block', marginTop: 3, fontFamily: INTER, fontSize: 17, color: C.muted }}>{ch.blurb}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
