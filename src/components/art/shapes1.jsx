/* Product drawings, part 1: seating, desks, controllers, headsets, input devices.
   Every drawer receives a context { c, c2, c3, cl, a, id, o } and returns SVG for a 400×300 viewBox. */
import { darken, lighten, mix, isLight } from './color.js';

const Grad = ({ id, from, to, x2 = 0, y2 = 1 }) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
);

export function Chair({ c, c2, c3, cl, a, id }) {
  return (
    <g>
      {/* base */}
      <g stroke={c3} strokeLinecap="round">
        <path d="M200 252 L118 270" strokeWidth="9" /><path d="M200 252 L282 270" strokeWidth="9" />
        <path d="M200 252 L150 280" strokeWidth="9" /><path d="M200 252 L250 280" strokeWidth="9" />
      </g>
      {[[116, 272], [284, 272], [148, 282], [252, 282]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="#0b0d12" stroke="#2a3140" />)}
      <rect x="192" y="212" width="16" height="44" rx="6" fill="#2a3140" />
      <rect x="192" y="212" width="16" height="44" rx="6" fill="url(#chrome)" opacity=".5" />
      {/* seat */}
      <path d="M126 204 Q200 192 274 204 L282 226 Q200 242 118 226 Z" fill={`url(#${id}s)`} />
      <path d="M126 204 Q200 192 274 204" fill="none" stroke={cl} strokeOpacity=".35" strokeWidth="2" />
      {/* backrest */}
      <path d="M146 30 Q200 14 254 30 L266 186 Q200 202 134 186 Z" fill={`url(#${id}b)`} />
      {/* bolsters */}
      <path d="M146 30 Q126 100 134 186 L160 184 L158 60 Z" fill={a} opacity=".95" />
      <path d="M254 30 Q274 100 266 186 L240 184 L242 60 Z" fill={a} opacity=".95" />
      <path d="M146 30 Q126 100 134 186" fill="none" stroke={lighten(a, .35)} strokeOpacity=".5" strokeWidth="1.5" />
      <rect x="168" y="64" width="64" height="112" rx="10" fill={c2} opacity=".85" />
      {[84, 106, 128, 150].map((y) => <path key={y} d={`M174 ${y} H226`} stroke={cl} strokeOpacity=".18" strokeDasharray="3 4" />)}
      {/* headrest */}
      <rect x="170" y="26" width="60" height="28" rx="13" fill={a} />
      <rect x="170" y="26" width="60" height="28" rx="13" fill="none" stroke={lighten(a, .4)} strokeOpacity=".5" />
      {/* armrests */}
      <rect x="110" y="152" width="8" height="52" rx="3" fill={c3} />
      <rect x="282" y="152" width="8" height="52" rx="3" fill={c3} />
      <rect x="98" y="146" width="34" height="12" rx="6" fill={c2} /><rect x="268" y="146" width="34" height="12" rx="6" fill={c2} />
    </g>
  );
}

export function Desk({ c, c2, c3, cl, a, id, o }) {
  const L = o.w ? 20 : 48, R = o.w ? 380 : 352;
  return (
    <g>
      <rect x={L} y="112" width={R - L} height="16" rx="4" fill="#3a4359" />
      <rect x={L} y="112" width={R - L} height="3" rx="1.5" fill={a} />
      {/* items */}
      <rect x="150" y="60" width="104" height="46" rx="4" fill="#0b0f18" stroke="#2a3346" /><rect x="154" y="64" width="96" height="36" rx="2" fill={mix('#0d1730', a, .22)} />
      <rect x="192" y="106" width="20" height="6" fill="#222a3a" />
      <rect x={L + 18} y="102" width="46" height="10" rx="3" fill="#1a2030" /><rect x={R - 62} y="100" width="22" height="12" rx="3" fill="#1a2030" />
      {/* frame */}
      {[L + 26, R - 36].map((x) => (
        <g key={x}>
          <rect x={x} y="128" width="10" height={o.s ? 100 : 136} fill="#2f384c" />
          {o.s && <rect x={x + 1} y="226" width="8" height="42" fill={c2} />}
          <rect x={x - 18} y="264" width="46" height="9" rx="4" fill="#3a4359" />
        </g>
      ))}
      <rect x={L + 36} y="136" width={R - L - 72} height="9" fill={c2} opacity=".9" />
      <rect x={L + 36} y="148" width={R - L - 72} height="14" rx="3" fill="none" stroke={cl} strokeOpacity=".18" strokeDasharray="4 4" />
    </g>
  );
}

/* ── Controllers ───────────────────────────────────────────────────────────────── */
const PAD = 'M110 90 C140 70 260 70 290 90 C320 100 345 170 340 215 C336 245 305 252 288 228 C275 205 262 195 245 195 L155 195 C138 195 125 205 112 228 C95 252 64 245 60 215 C55 170 80 100 110 90 Z';
const Stick = ({ x, y, r = 17, c3, a }) => (<g><circle cx={x} cy={y} r={r + 5} fill="#0a0c11" opacity=".55" /><circle cx={x} cy={y} r={r} fill="#171a22" stroke="#2b3140" /><circle cx={x} cy={y} r={r - 6} fill="#0d0f15" /><circle cx={x} cy={y} r={r - 6} fill="none" stroke={a} strokeOpacity=".35" /></g>);
const Dpad = ({ x, y, k = '#14171e' }) => (<g fill={k}><rect x={x - 5.5} y={y - 16} width="11" height="32" rx="3" /><rect x={x - 16} y={y - 5.5} width="32" height="11" rx="3" /></g>);

export function PadPS({ c, c2, c3, cl, a, id, o }) {
  const light = isLight(c);
  const plate = light ? '#14161c' : mix(c, '#ffffff', .1);
  return (
    <g>
      <rect x="104" y="72" width="54" height="14" rx="7" fill={c2} /><rect x="242" y="72" width="54" height="14" rx="7" fill={c2} />
      <path d={PAD} fill={`url(#${id}p)`} />
      <path d="M112 92 C140 74 260 74 288 92" fill="none" stroke={cl} strokeOpacity=".5" strokeWidth="1.5" />
      {/* two-tone grips */}
      <path d="M150 82 C170 76 230 76 250 82 L246 190 L154 190 Z" fill={plate} />
      <path d="M156 196 H244" stroke={a} strokeOpacity=".0" />
      {/* touchpad + light bar */}
      <rect x="168" y={o.ds4 ? 84 : 90} width="64" height={o.ds4 ? 40 : 34} rx="9" fill={light ? '#2a2e38' : '#262a34'} />
      <path d="M156 94 C162 120 164 140 160 164" fill="none" stroke={a} strokeWidth="3" strokeLinecap="round" opacity=".95" />
      <path d="M244 94 C238 120 236 140 240 164" fill="none" stroke={a} strokeWidth="3" strokeLinecap="round" opacity=".95" />
      <Stick x={168} y={168} c3={c3} a={a} /><Stick x={232} y={168} c3={c3} a={a} />
      <circle cx="200" cy="166" r="5" fill="#2c3240" />
      <Dpad x={116} y={126} k={light ? '#161920' : '#10131a'} />
      <g fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(284 126)">
        {[[0, -16, '#7bb6ff', 'tri'], [16, 0, '#ff7a9c', 'o'], [0, 16, '#86b6ff', 'x'], [-16, 0, '#ff9ad0', 'sq']].map(([x, y, col, s]) => (
          <g key={s} transform={`translate(${x} ${y})`}><circle r="10" fill="#14171e" /><g stroke={col}>{s === 'tri' && <path d="M0 -4.5 L4.5 3.5 H-4.5 Z" />}{s === 'o' && <circle r="4.2" />}{s === 'x' && <path d="M-4 -4 L4 4 M4 -4 L-4 4" />}{s === 'sq' && <rect x="-4" y="-4" width="8" height="8" />}</g></g>
        ))}
      </g>
      {o.edge && <g><rect x="150" y="232" width="18" height="12" rx="6" fill="#171a22" /><rect x="232" y="232" width="18" height="12" rx="6" fill="#171a22" /><circle cx="168" cy="168" r="3" fill={a} /></g>}
    </g>
  );
}

export function PadXbox({ c, c2, c3, cl, a, id, o }) {
  const light = isLight(c);
  const ink = light ? '#15181f' : '#0c0e13';
  return (
    <g>
      <rect x="100" y="70" width="58" height="16" rx="8" fill={c2} /><rect x="242" y="70" width="58" height="16" rx="8" fill={c2} />
      <path d={PAD} fill={`url(#${id}p)`} />
      <path d="M112 92 C140 74 260 74 288 92" fill="none" stroke={cl} strokeOpacity=".5" strokeWidth="1.5" />
      <Stick x={134} y={124} c3={c3} a={a} />
      <Stick x={226} y={170} c3={c3} a={a} />
      <Dpad x={174} y={170} k={ink} />
      {/* ABXY */}
      <g transform="translate(272 124)">
        {[[0, -16, '#f5c542', 'Y'], [16, 0, '#e5483f', 'B'], [0, 16, '#3fbf6b', 'A'], [-16, 0, '#4a8cf0', 'X']].map(([x, y, col, t]) => (
          <g key={t}><circle cx={x} cy={y} r="10.5" fill={ink} /><text x={x} y={y + 3.6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={col} fontFamily="Sora, sans-serif">{t}</text></g>
        ))}
      </g>
      <circle cx="200" cy="100" r="12" fill={ink} /><circle cx="200" cy="100" r="7" fill="none" stroke={o.a || a} strokeWidth="2" />
      <rect x="170" y="108" width="12" height="7" rx="3.5" fill={ink} opacity=".8" /><rect x="218" y="108" width="12" height="7" rx="3.5" fill={ink} opacity=".8" />
      {o.old && <circle cx="200" cy="100" r="5" fill={a} />}
      {(o.pro || o.edge) && <g><rect x="150" y="226" width="20" height="14" rx="7" fill={ink} /><rect x="230" y="226" width="20" height="14" rx="7" fill={ink} /><circle cx="226" cy="170" r="3" fill={a} /></g>}
    </g>
  );
}

export function PadPro({ c, c2, c3, cl, a, id, o }) {
  const light = isLight(c);
  const ink = light ? '#15181f' : '#0c0e13';
  return (
    <g>
      {o.wide && <g><rect x="40" y="96" width="320" height="120" rx="26" fill={c3} /><rect x="120" y="108" width="160" height="96" rx="8" fill="#0b1018" stroke="#2a3346" /><rect x="128" y="114" width="144" height="84" rx="4" fill={mix('#0d1730', a, .25)} /></g>}
      {!o.wide && <>
        <rect x="104" y="72" width="54" height="14" rx="7" fill={c2} /><rect x="242" y="72" width="54" height="14" rx="7" fill={c2} />
        <path d={PAD} fill={`url(#${id}p)`} />
        <path d="M112 92 C140 74 260 74 288 92" fill="none" stroke={cl} strokeOpacity=".5" strokeWidth="1.5" />
        <Stick x={134} y={122} c3={c3} a={a} /><Stick x={232} y={170} c3={c3} a={a} />
        <Dpad x={170} y={170} k={ink} />
        <g transform="translate(272 122)">{[[0, -15], [15, 0], [0, 15], [-15, 0]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9.5" fill={ink} />)}</g>
        <circle cx="200" cy="106" r="6" fill={a} opacity=".9" /><rect x="178" y="112" width="10" height="6" rx="3" fill={ink} /><rect x="212" y="112" width="10" height="6" rx="3" fill={ink} />
        {o.pro && <g><rect x="150" y="228" width="20" height="12" rx="6" fill={ink} /><rect x="230" y="228" width="20" height="12" rx="6" fill={ink} /></g>}
      </>}
    </g>
  );
}

export function JoyCon({ a }) {
  const L = '#2dc5e6', R = '#ff5a5a';
  const Pill = ({ x, col, left }) => (
    <g transform={`translate(${x} 36)`}>
      <rect width="62" height="226" rx="30" fill={col} /><rect width="62" height="226" rx="30" fill="url(#gloss)" opacity=".5" />
      <circle cx="31" cy={left ? 66 : 96} r="15" fill="#1a1d25" /><circle cx="31" cy={left ? 66 : 96} r="9" fill="#0d0f14" />
      {left ? (<g fill="#1a1d25"><circle cx="31" cy="140" r="8" /><circle cx="31" cy="172" r="8" /><circle cx="15" cy="156" r="8" /><circle cx="47" cy="156" r="8" /></g>) : (<g fill="#1a1d25"><circle cx="31" cy="162" r="8" /><circle cx="31" cy="194" r="8" /><circle cx="15" cy="178" r="8" /><circle cx="47" cy="178" r="8" /></g>)}
      <rect x="22" y="200" width="18" height="6" rx="3" fill="#00000030" />
    </g>
  );
  return <g><Pill x={90} col={L} left /><Pill x={248} col={R} /></g>;
}

/* ── Headset ──────────────────────────────────────────────────────────────────── */
export function Headset({ c, c2, c3, cl, a, id, o }) {
  const pad = darken(c, .4);
  return (
    <g>
      <path d="M92 150 C90 36 310 36 308 150" fill="none" stroke={c3} strokeWidth="18" strokeLinecap="round" />
      <path d="M92 150 C90 36 310 36 308 150" fill="none" stroke={c} strokeWidth="12" strokeLinecap="round" />
      <path d="M126 82 C170 52 230 52 274 82" fill="none" stroke={darken(c, .5)} strokeWidth="14" strokeLinecap="round" />
      <path d="M126 82 C170 52 230 52 274 82" fill="none" stroke={a} strokeWidth="2.5" strokeLinecap="round" opacity=".9" transform="translate(0 4)" />
      {[92, 308].map((x) => (
        <g key={x}>
          <rect x={x - 30} y="116" width="60" height="96" rx="28" fill={`url(#${id}p)`} />
          <rect x={x - 21} y="128" width="42" height="72" rx="20" fill={pad} opacity=".6" />
          <circle cx={x} cy="164" r="14" fill="none" stroke={a} strokeWidth="2.5" opacity=".95" />
          <circle cx={x} cy="164" r="6" fill={a} opacity=".35" />
          <rect x={x - 30} y="116" width="60" height="96" rx="28" fill="none" stroke={cl} strokeOpacity=".25" />
        </g>
      ))}
      {/* boom mic */}
      {!o.nomic && <path d="M64 192 C40 214 54 246 98 252" fill="none" stroke={c3} strokeWidth="6" strokeLinecap="round" />}
      {!o.nomic && <circle cx="104" cy="252" r="8" fill={c2} stroke={a} strokeWidth="1.5" />}
      {o.wired && <path d="M308 210 C310 240 330 250 340 276" fill="none" stroke="#2a3140" strokeWidth="3" strokeLinecap="round" />}
      {o.hot && <rect x="288" y="150" width="14" height="30" rx="3" fill={a} opacity=".5" />}
    </g>
  );
}

/* ── Keyboard / Mouse ──────────────────────────────────────────────────────────── */
const LAYOUTS = { full: 20, tkl: 17, '75': 16, '65': 15 };
export function Keyboard({ c, c2, c3, cl, a, id, o }) {
  const k = o.k || 'full';
  const cols = LAYOUTS[k] || 17;
  const light = isLight(c);
  const keyFill = light ? '#f3f5f9' : mix(c, '#ffffff', .12);
  const rows = o.low ? 5 : 6;
  const W = k === 'full' ? 340 : k === 'tkl' ? 300 : k === '75' ? 280 : 260;
  const x0 = 200 - W / 2, H = 132, y0 = 84;
  const gap = 3, kw = (W - 16 - gap * (cols - 1)) / cols, kh = (H - 16 - gap * (rows - 1)) / rows;
  const keys = [];
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    const last = r === rows - 1;
    if (last && i > 3 && i < 9) continue;
    const ww = last && i === 3 ? kw * 6 + gap * 5 : kw;
    keys.push(<rect key={`${r}-${i}`} x={x0 + 8 + i * (kw + gap)} y={y0 + 8 + r * (kh + gap)} width={ww} height={kh} rx="2.4" fill={keyFill} opacity={r === 0 ? 0.85 : 1} />);
  }
  return (
    <g>
      <rect x={x0 - 4} y={y0 + 6} width={W + 8} height={H + 4} rx="14" fill={a} opacity=".28" filter="url(#blur6)" />
      <rect x={x0} y={y0} width={W} height={H} rx="12" fill={`url(#${id}p)`} stroke={cl} strokeOpacity=".15" />
      <rect x={x0 + 6} y={y0 + 6} width={W - 12} height={H - 12} rx="8" fill={darken(c, .45)} />
      {keys}
      {o.dial && <g><circle cx={x0 + W - 22} cy={y0 - 10} r="12" fill="#161a22" stroke="#2c3342" /><circle cx={x0 + W - 22} cy={y0 - 10} r="5" fill={a} opacity=".8" /></g>}
      <rect x={x0 + 8} y={y0 + H - 4} width={W - 16} height="2.5" rx="1" fill={a} opacity=".9" />
    </g>
  );
}

export function Mouse({ c, c2, c3, cl, a, id, o, wired }) {
  const bw = o.sym ? 44 : 50;
  return (
    <g>
      {wired && <path d="M200 52 C200 20 240 18 262 -10" fill="none" stroke="#2a3140" strokeWidth="3" strokeLinecap="round" />}
      <ellipse cx="200" cy="146" rx="70" ry="104" fill={a} opacity=".16" filter="url(#blur6)" />
      <path d={`M200 44 C${200 + bw + 10} 44 ${200 + bw + 6} 98 ${200 + bw + 4} 150 C${200 + bw + 4} 218 ${200 + bw - 14} 254 200 254 C${200 - bw + 14} 254 ${200 - bw - 4} 218 ${200 - bw - 4} 150 C${200 - bw - 6} 98 ${200 - bw - 10} 44 200 44 Z`} fill={`url(#${id}p)`} />
      <path d={`M200 44 C${200 + bw + 10} 44 ${200 + bw + 6} 98 ${200 + bw + 4} 150`} fill="none" stroke={cl} strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M200 52 V122" stroke={darken(c, .5)} strokeWidth="2" /><path d={`M${200 - bw - 2} 122 H${200 + bw + 2}`} stroke={darken(c, .5)} strokeWidth="2" />
      <rect x="193" y="74" width="14" height="30" rx="7" fill="#12151c" stroke={a} strokeOpacity=".8" />
      {o.wing && <g><rect x={200 - bw - 9} y="128" width="14" height="22" rx="5" fill="#161a22" /><rect x={200 - bw - 9} y="154" width="14" height="22" rx="5" fill="#161a22" /></g>}
      <path d={`M${200 - bw + 8} 232 Q200 262 ${200 + bw - 8} 232`} stroke={a} strokeWidth="3" fill="none" strokeLinecap="round" opacity=".95" />
    </g>
  );
}

export function Mic({ c, c2, c3, cl, a, id, o }) {
  const s = o.small ? 0.85 : 1;
  return (
    <g transform={`translate(200 150) scale(${s}) translate(-200 -150)`}>
      <ellipse cx="200" cy="268" rx="70" ry="9" fill="#00000050" />
      <path d="M120 120 V190 Q120 232 200 232 Q280 232 280 190 V120" fill="none" stroke={c3} strokeWidth="9" strokeLinecap="round" />
      <rect x="156" y="236" width="88" height="26" rx="10" fill={c2} /><rect x="156" y="236" width="88" height="5" rx="2" fill={a} />
      <rect x="198" y="226" width="4" height="14" fill={c3} />
      <rect x="148" y="34" width="104" height="168" rx="52" fill={`url(#${id}p)`} />
      <clipPath id={`${id}m`}><rect x="148" y="34" width="104" height="168" rx="52" /></clipPath>
      <g clipPath={`url(#${id}m)`} stroke={cl} strokeOpacity=".16">
        {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M148 ${42 + i * 12} H252`} />)}
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${156 + i * 12} 34 V202`} />)}
      </g>
      <rect x="148" y="112" width="104" height="14" fill={darken(c, .35)} opacity=".9" />
      <rect x="148" y="116" width="104" height="3" fill={a} />
      {o.yeti && <circle cx="200" cy="164" r="9" fill="#12151c" stroke={a} />}
    </g>
  );
}
