import { interpolate, Easing } from 'remotion';
import { C, SORA, INTER, MONO } from '../theme.js';

const CARD_W = 440;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/* A loose, hand-drawn loop: an ellipse that overshoots its start a little, with a gentle wobble. */
function loopPath(cx, cy, rx, ry) {
  const pts = [];
  const start = -1.95; // a little before the top
  const sweep = Math.PI * 2 + 0.55;
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    const wob = 1 + 0.025 * Math.sin(a * 3 + 0.6) + (i / steps) * 0.045; // spirals out slightly so the ends don't meet
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { d: `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L')}`, len };
}

/**
 * Circles a target and explains it.
 * rect: target in video px. clip: the visible page area (circle and dimming stay inside it).
 * bounds: where the explanation card may go. f: frames since the note started. dur: note length.
 */
export default function Note({ rect, clip, bounds, f, dur, index, title, text, label = 'Look here' }) {
  const inP = interpolate(f, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const outP = interpolate(f, [dur - 12, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const vis = Math.min(inP, outP);
  if (vis <= 0) return null;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const rx = Math.min(rect.w / 2 * 1.12 + 18, clip.w * 0.62);
  const ry = Math.min(rect.h / 2 * 1.2 + 16, clip.h * 0.62);
  const { d, len } = loopPath(cx, cy, rx, ry);
  const draw = interpolate(f, [4, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const pulse = 1 + 0.012 * Math.sin(f / 9);

  // Card: beside the loop if there is room, otherwise below or above it.
  const gap = 34;
  let side = 'right';
  let x = cx + rx + gap;
  if (x + CARD_W > bounds.x + bounds.w - 20) { side = 'left'; x = cx - rx - gap - CARD_W; }
  if (x < bounds.x + 20) {
    x = Math.max(bounds.x + 20, Math.min(cx - CARD_W / 2, bounds.x + bounds.w - CARD_W - 20));
    side = cy + ry + 190 < bounds.y + bounds.h ? 'below' : 'above';
  }
  const anchorY = side === 'below' ? cy + ry + gap : side === 'above' ? cy - ry - gap : Math.max(bounds.y + 110, Math.min(cy, bounds.y + bounds.h - 110));
  const translateY = side === 'below' ? '0%' : side === 'above' ? '-100%' : '-50%';
  const lineFrom = side === 'right' ? [cx + rx * 0.98, cy] : side === 'left' ? [cx - rx * 0.98, cy] : side === 'below' ? [cx, cy + ry * 0.98] : [cx, cy - ry * 0.98];
  const lineTo = side === 'right' ? [x, anchorY] : side === 'left' ? [x + CARD_W, anchorY] : [Math.max(x + 30, Math.min(cx, x + CARD_W - 30)), anchorY];
  const cardIn = interpolate(f, [12, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const slide = (1 - cardIn) * (side === 'left' ? -18 : side === 'right' ? 18 : side === 'below' ? 14 : -14);

  return (
    <>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <clipPath id={`clip-${index}`}><rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} rx={clip.r || 0} /></clipPath>
          <mask id={`spot-${index}`}>
            <rect x="0" y="0" width="1920" height="1080" fill="white" />
            <ellipse cx={cx} cy={cy} rx={rx * 0.98} ry={ry * 0.98} fill="black" />
          </mask>
        </defs>
        <g clipPath={`url(#clip-${index})`}>
          <rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} fill="#060a13" opacity={0.42 * vis} mask={`url(#spot-${index})`} />
          <g style={{ transform: `scale(${pulse})`, transformOrigin: `${cx}px ${cy}px` }} opacity={outP}>
            <path d={d} fill="none" stroke="rgba(6,10,19,0.55)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
            <path d={d} fill="none" stroke={C.amber} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} style={{ filter: 'drop-shadow(0 0 10px rgba(255,194,61,0.55))' }} />
          </g>
        </g>
        <g opacity={cardIn * outP}>
          <line x1={lineFrom[0]} y1={lineFrom[1]} x2={lineTo[0]} y2={lineTo[1]} stroke={C.amber} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
          <circle cx={lineTo[0]} cy={lineTo[1]} r="5" fill={C.amber} />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute', left: x, top: anchorY, width: CARD_W,
          transform: `translate(${side === 'left' || side === 'right' ? slide : 0}px, calc(${translateY} + ${side === 'below' || side === 'above' ? slide : 0}px))`,
          opacity: cardIn * outP,
          padding: '20px 24px 22px', borderRadius: 18,
          background: 'rgba(9,14,27,0.94)', border: '1px solid rgba(255,194,61,0.35)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 15, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: C.amber, boxShadow: `0 0 10px ${C.amber}` }} />
          {label}
        </div>
        <div style={{ marginTop: 10, fontFamily: SORA, fontWeight: 800, fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em', color: C.text }}>{title}</div>
        <div style={{ marginTop: 10, fontFamily: INTER, fontSize: 21, lineHeight: 1.45, color: C.text2 }}>{text}</div>
      </div>
    </>
  );
}
