/* Product drawings, part 2: displays, consoles, games, storage, PC parts, sim gear, accessories. */
import { darken, lighten, mix } from './color.js';

const Screen = ({ x, y, w, h, a, id, r = 3 }) => (
  <g>
    <clipPath id={`${id}sc${x}`}><rect x={x} y={y} width={w} height={h} rx={r} /></clipPath>
    <rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#${id}scr)`} />
    <g clipPath={`url(#${id}sc${x})`}>
      <circle cx={x + w * 0.72} cy={y + h * 0.52} r={h * 0.28} fill={a} opacity=".35" />
      <path d={`M${x} ${y + h * 0.74} L${x + w * 0.22} ${y + h * 0.46} L${x + w * 0.38} ${y + h * 0.64} L${x + w * 0.58} ${y + h * 0.36} L${x + w * 0.82} ${y + h * 0.66} L${x + w} ${y + h * 0.52} V${y + h} H${x} Z`} fill="#0a1020" opacity=".92" />
      <path d={`M${x} ${y + h * 0.86} Q${x + w * 0.3} ${y + h * 0.7} ${x + w * 0.6} ${y + h * 0.82} T${x + w} ${y + h * 0.78} V${y + h} H${x} Z`} fill="#070b16" />
    </g>
  </g>
);

export function Monitor({ c, c2, c3, a, id, o }) {
  const ultra = o.ultra;
  const x = ultra ? 24 : 54, w = ultra ? 352 : 292, y = 46, h = ultra ? 150 : 166;
  return (
    <g>
      <path d={`M${200 - 14} ${y + h + 4} L${200 - 22} 252 H${200 + 22} L${200 + 14} ${y + h + 4} Z`} fill={`url(#${id}p)`} />
      <rect x="140" y="252" width="120" height="10" rx="5" fill={c2} />
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx="9" fill={c3} />
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx="9" fill="none" stroke={lighten(c, .2)} strokeOpacity=".25" />
      <Screen x={x} y={y} w={w} h={h} a={a} id={id} />
      <rect x={x} y={y + h + 3} width={w} height="2" fill={a} opacity=".85" />
    </g>
  );
}

/* ── Consoles ─────────────────────────────────────────────────────────────────── */
export function ConsolePS5({ c, a, id, o }) {
  const dark = o.dark;
  const shell = dark ? '#262a33' : '#eceff4';
  return (
    <g>
      <path d="M200 252 L146 266 H254 Z" fill="#14171e" />
      <rect x="176" y="30" width="48" height="226" rx="6" fill="#12141b" />
      <path d="M180 30 C158 34 150 80 152 140 C154 200 164 240 180 256 Z" fill={shell} />
      <path d="M220 30 C242 34 250 80 248 140 C246 200 236 240 220 256 Z" fill={darken(shell, .07)} />
      <path d="M180 30 C158 34 150 80 152 140" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
      <path d="M200 34 V254" stroke={a} strokeWidth="2" opacity=".85" />
      {!o.digital && <rect x="226" y="150" width="10" height="50" rx="3" fill="#00000018" />}
      {o.pro && <g stroke={shell} strokeWidth="3">{[92, 102, 112].map((y) => <path key={y} d={`M186 ${y} H214`} />)}</g>}
      <circle cx="207" cy="238" r="3.5" fill={shell} /><circle cx="193" cy="238" r="3.5" fill={shell} />
    </g>
  );
}
export function ConsolePS4({ a }) {
  return (
    <g>
      <path d="M62 148 L292 128 L340 188 L110 212 Z" fill="#1a1d25" /><path d="M62 148 L292 128 L340 188 L110 212 Z" fill="url(#gloss)" opacity=".4" />
      <path d="M110 212 L340 188 V204 L112 230 Z" fill="#0f1218" />
      <path d="M62 148 L110 212 V230 L62 164 Z" fill="#131620" />
      <path d="M96 188 L300 168" stroke={a} strokeWidth="3" opacity=".9" />
      <path d="M118 176 L240 164" stroke="#2c313d" strokeWidth="6" strokeLinecap="round" />
      <circle cx="316" cy="162" r="3" fill="#2c313d" />
    </g>
  );
}
export function ConsoleXbox({ c, a, o, id }) {
  if (o.small || o.one) {
    const w = o.dark ? '#1c1f27' : '#eceff4';
    return (
      <g>
        <path d="M80 130 H300 L328 100 H112 Z" fill={lighten(w, o.dark ? .12 : 0)} />
        <rect x="80" y="130" width="220" height="92" rx="4" fill={w} />
        <path d="M300 130 L328 100 V192 L300 222 Z" fill={darken(w, .1)} />
        <circle cx="190" cy="176" r="30" fill="#0c0e13" /><circle cx="190" cy="176" r="30" fill="none" stroke={o.dark ? '#2f3644' : '#cfd5df'} strokeDasharray="1.5 3" strokeWidth="6" opacity=".6" />
        <circle cx="190" cy="176" r="12" fill={o.one ? '#0c0e13' : '#0c0e13'} />
        <rect x="268" y="196" width="22" height="4" rx="2" fill={a} />
      </g>
    );
  }
  return (
    <g>
      <path d="M130 88 H262 L276 62 H144 Z" fill="#232731" />
      <rect x="130" y="88" width="132" height="168" rx="3" fill="#14171e" />
      <path d="M262 88 L276 62 V228 L262 256 Z" fill="#0d0f14" />
      <circle cx="210" cy="75" r="14" fill="#0b0d12" /><circle cx="210" cy="75" r="14" fill="none" stroke={a} strokeWidth="2.5" opacity=".95" />
      <path d="M142 112 H250 M142 122 H250 M142 132 H250" stroke="#ffffff10" />
      <rect x="226" y="236" width="24" height="5" rx="2.5" fill={a} />
    </g>
  );
}
export function ConsoleSwitch({ a, o }) {
  if (o.lite) {
    return (<g><rect x="76" y="86" width="248" height="130" rx="26" fill="#2fb9c9" /><rect x="116" y="100" width="168" height="102" rx="4" fill="#0b0f16" /><rect x="120" y="104" width="160" height="94" rx="2" fill={mix('#0d1730', '#5fc7ff', .25)} /><circle cx="96" cy="126" r="9" fill="#17323a" /><circle cx="304" cy="168" r="9" fill="#17323a" /></g>);
  }
  const L = o.gen2 ? '#1a1d25' : '#38c1e6', R = o.gen2 ? '#1a1d25' : '#ff5a5a';
  return (
    <g>
      <rect x="60" y="80" width="56" height="140" rx="22" fill={L} /><rect x="284" y="80" width="56" height="140" rx="22" fill={R} />
      <rect x="112" y="84" width="176" height="132" rx="5" fill="#13161d" stroke="#2a3140" />
      <rect x="120" y="92" width="160" height="116" rx="2" fill="#070a10" />
      <path d="M120 176 L170 140 L200 160 L238 118 L280 160 V208 H120 Z" fill={mix('#0d1730', a, .45)} opacity=".95" />
      <circle cx="88" cy="112" r="10" fill="#14171e" /><circle cx="312" cy="168" r="10" fill="#14171e" />
    </g>
  );
}

/* ── Game case ────────────────────────────────────────────────────────────────── */
export function Game({ o, a }) {
  const tone = o.tone || a;
  const words = String(o.title || 'GAME').split(' ');
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 11 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  const fs = lines.length > 2 ? 15 : 18;
  return (
    <g>
      <rect x="116" y="30" width="168" height="244" rx="7" fill="#0d1017" />
      <rect x="122" y="34" width="156" height="236" rx="4" fill={darken(tone, .55)} />
      <rect x="122" y="34" width="156" height="236" rx="4" fill="url(#gloss)" opacity=".3" />
      <circle cx="238" cy="112" r="68" fill={tone} opacity=".55" />
      <circle cx="238" cy="112" r="40" fill={lighten(tone, .3)} opacity=".35" />
      <path d="M122 190 L170 142 L206 172 L246 124 L278 160 V270 H122 Z" fill="#0b0e15" opacity=".92" />
      <rect x="122" y="34" width="156" height="18" fill="#0a0c12" /><rect x="122" y="48" width="156" height="3" fill={tone} />
      {lines.map((l, i) => <text key={i} x="200" y={206 + i * (fs + 5)} textAnchor="middle" fill="#fff" fontFamily="Sora, sans-serif" fontWeight="800" fontSize={fs} letterSpacing=".5">{l}</text>)}
      <rect x="116" y="30" width="9" height="244" rx="4" fill="#00000050" />
    </g>
  );
}

/* ── Storage ──────────────────────────────────────────────────────────────────── */
export function SSD({ c, c3, a, id, o }) {
  if (o.card) return (
    <g><path d="M120 70 H250 L280 100 V230 H120 Z" fill="#14171e" stroke="#2b3140" /><rect x="136" y="92" width="116" height="26" rx="4" fill={a} opacity=".9" />
      <text x="194" y="110" textAnchor="middle" fontSize="12" fontWeight="800" fill="#06130c" fontFamily="Sora, sans-serif">1TB</text>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={128 + i * 15} y="196" width="8" height="26" fill="#c9a24a" opacity=".9" />)}</g>
  );
  return (
    <g>
      <rect x="40" y="108" width="320" height="86" rx="6" fill="#171a21" stroke="#2b3140" />
      {o.sink ? <g><rect x="82" y="100" width="236" height="102" rx="5" fill={`url(#${id}p)`} />{Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${92 + i * 13.5} 104 V198`} stroke="#00000045" strokeWidth="3" />)}<rect x="82" y="100" width="236" height="5" fill={a} /></g>
        : <g>{[100, 170, 240].map((x) => <rect key={x} x={x} y="124" width="56" height="54" rx="3" fill="#0b0d12" stroke="#2b3140" />)}</g>}
      <rect x="40" y="108" width="26" height="86" fill="#c9a24a" opacity=".9" /><rect x="40" y="108" width="12" height="86" fill="#8b6e2a" />
    </g>
  );
}

export function Dock({ c, c2, c3, cl, a, id, o }) {
  if (o.battery) return (
    <g><rect x="110" y="120" width="150" height="76" rx="9" fill="#1a1d25" stroke="#2b3140" /><rect x="260" y="148" width="14" height="20" rx="3" fill="#2b3140" /><rect x="120" y="130" width="100" height="56" rx="5" fill={a} opacity=".18" /><rect x="124" y="134" width="40" height="48" rx="4" fill={a} opacity=".9" /><rect x="170" y="134" width="40" height="48" rx="4" fill={a} opacity=".55" />
      <path d="M274 158 C320 158 330 220 300 232" fill="none" stroke="#2a3140" strokeWidth="5" strokeLinecap="round" /><rect x="292" y="228" width="22" height="12" rx="3" fill="#2a3140" /></g>
  );
  const pad = (x, rot) => (<g transform={`translate(${x} 148) rotate(${rot})`}><path d="M-34 -6 C-20 -20 20 -20 34 -6 C46 8 46 40 38 54 C28 62 20 46 14 38 H-14 C-20 46 -28 62 -38 54 C-46 40 -46 8 -34 -6 Z" fill={c} stroke={cl} strokeOpacity=".3" /><rect x="-20" y="-8" width="40" height="5" rx="2.5" fill={a} opacity=".9" /></g>);
  return (
    <g>
      <path d="M96 228 L120 188 H280 L304 228 Z" fill={`url(#${id}p)`} /><rect x="96" y="228" width="208" height="14" rx="4" fill={c2} />
      {pad(150, -6)}{pad(250, 6)}
      <rect x="188" y="206" width="24" height="5" rx="2.5" fill={a} />
    </g>
  );
}

export function Remote({ c, c2, cl, a, id }) {
  return (
    <g><rect x="160" y="28" width="80" height="244" rx="34" fill={`url(#${id}p)`} /><rect x="160" y="28" width="80" height="244" rx="34" fill="none" stroke={cl} strokeOpacity=".3" />
      <circle cx="200" cy="82" r="22" fill="#14171e" /><circle cx="200" cy="82" r="8" fill={a} opacity=".9" />
      {[[178, 140], [222, 140], [178, 172], [222, 172], [178, 204], [222, 204]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="10" fill="#14171e" />)}
      <circle cx="200" cy="244" r="8" fill="#14171e" /></g>
  );
}
export function Portal({ a }) {
  return (
    <g>
      <rect x="40" y="86" width="64" height="128" rx="30" fill="#eceff4" /><rect x="296" y="86" width="64" height="128" rx="30" fill="#eceff4" />
      <rect x="82" y="92" width="236" height="116" rx="12" fill="#14171e" /><rect x="90" y="98" width="220" height="104" rx="5" fill="#070a10" />
      <path d="M90 180 L150 140 L190 164 L240 120 L310 170 V202 H90 Z" fill={mix('#0d1730', a, .5)} />
      <circle cx="66" cy="124" r="12" fill="#14171e" /><circle cx="334" cy="172" r="12" fill="#14171e" />
    </g>
  );
}

/* ── PC parts ─────────────────────────────────────────────────────────────────── */
const Fan = ({ cx, cy, r, a, n = 9 }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#0b0d12" stroke="#2b3140" strokeWidth="2" />
    {Array.from({ length: n }, (_, i) => <path key={i} d={`M${cx} ${cy} Q${cx + r * 0.7} ${cy - r * 0.2} ${cx + r * 0.62} ${cy - r * 0.62}`} fill="none" stroke="#1f2430" strokeWidth={r * 0.24} strokeLinecap="round" transform={`rotate(${(360 / n) * i} ${cx} ${cy})`} />)}
    <circle cx={cx} cy={cy} r={r * 0.9} fill="none" stroke={a} strokeOpacity=".75" strokeWidth="2" />
    <circle cx={cx} cy={cy} r={r * 0.22} fill="#151922" />
  </g>
);
export function GPU({ c, c2, a, id }) {
  return (
    <g>
      <rect x="40" y="94" width="320" height="116" rx="10" fill={`url(#${id}p)`} />
      <rect x="40" y="94" width="320" height="6" rx="3" fill={a} />
      <Fan cx={130} cy={154} r={42} a={a} /><Fan cx={248} cy={154} r={42} a={a} />
      <rect x="322" y="108" width="30" height="88" rx="4" fill={c2} opacity=".7" />
      <rect x="22" y="100" width="18" height="104" rx="2" fill="#aeb5c2" />
      <rect x="60" y="210" width="190" height="10" fill="#c9a24a" opacity=".9" />
    </g>
  );
}
export function RAM({ c, c2, a, id }) {
  return (
    <g>
      <rect x="40" y="90" width="320" height="110" rx="6" fill={`url(#${id}p)`} />
      <rect x="40" y="90" width="320" height="22" rx="5" fill={a} opacity=".95" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={58 + i * 38} y="122" width="30" height="62" rx="3" fill="#0b0d12" opacity=".5" />)}
      <rect x="40" y="200" width="320" height="10" fill="#c9a24a" opacity=".9" />
      <rect x="64" y="94" width="60" height="14" rx="2" fill="#00000030" />
    </g>
  );
}
export function PSU({ c, c2, a, id }) {
  return (
    <g>
      <rect x="80" y="64" width="200" height="170" rx="10" fill={`url(#${id}p)`} />
      <circle cx="180" cy="148" r="64" fill="#0b0d12" /><circle cx="180" cy="148" r="64" fill="none" stroke={a} strokeWidth="2" opacity=".7" />
      {[24, 40, 56].map((r) => <circle key={r} cx="180" cy="148" r={r} fill="none" stroke="#2b3140" strokeWidth="3" />)}
      <circle cx="180" cy="148" r="8" fill="#151922" />
      <rect x="280" y="94" width="40" height="86" rx="4" fill="#12151c" />{[110, 128, 146, 164].map((y) => <rect key={y} x="286" y={y - 8} width="28" height="10" rx="2" fill="#2b3140" />)}
      <path d="M320 112 C350 112 358 230 338 262" fill="none" stroke="#2a3140" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}
export function AIO({ c, c2, a, id }) {
  return (
    <g>
      <rect x="150" y="48" width="200" height="190" rx="8" fill={c2} /><rect x="150" y="48" width="200" height="190" rx="8" fill="none" stroke="#2b3140" />
      {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${158 + i * 8.6} 54 V232`} stroke="#00000050" />)}
      <Fan cx={250} cy={78} r={26} a={a} n={7} /><Fan cx={250} cy={143} r={26} a={a} n={7} /><Fan cx={250} cy={208} r={26} a={a} n={7} />
      <path d="M150 90 C120 90 110 130 96 140" fill="none" stroke="#1d2129" strokeWidth="12" strokeLinecap="round" />
      <path d="M150 200 C120 200 112 170 96 164" fill="none" stroke="#1d2129" strokeWidth="12" strokeLinecap="round" />
      <circle cx="68" cy="152" r="44" fill={`url(#${id}p)`} /><circle cx="68" cy="152" r="30" fill="#0a0c11" stroke={a} strokeWidth="2.5" /><circle cx="68" cy="152" r="14" fill={a} opacity=".3" />
    </g>
  );
}
export function Mobo({ c, c2, a, id }) {
  return (
    <g>
      <rect x="86" y="30" width="228" height="240" rx="6" fill="#12161e" stroke="#2b3140" />
      <rect x="96" y="40" width="96" height="62" rx="4" fill={`url(#${id}p)`} /><rect x="96" y="40" width="96" height="5" fill={a} />
      <rect x="150" y="124" width="56" height="56" rx="3" fill="#0a0d13" stroke="#aeb5c2" strokeOpacity=".6" /><rect x="164" y="138" width="28" height="28" rx="2" fill="#aeb5c2" opacity=".35" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={226 + i * 17} y="40" width="9" height="130" rx="2" fill="#0b0d12" stroke="#2b3140" />)}
      <rect x="96" y="200" width="132" height="18" rx="2" fill="#0b0d12" stroke="#2b3140" /><rect x="96" y="230" width="132" height="14" rx="2" fill="#0b0d12" stroke="#2b3140" />
      <rect x="236" y="196" width="68" height="62" rx="4" fill={`url(#${id}p)`} /><rect x="236" y="196" width="68" height="4" fill={a} />
    </g>
  );
}
export function Tower({ c, c2, c3, a, id, o }) {
  return (
    <g>
      <rect x="112" y="24" width="176" height="244" rx="10" fill={`url(#${id}p)`} />
      <rect x="122" y="34" width="120" height="224" rx="6" fill="#0a0d13" stroke="#2f3646" />
      <rect x="122" y="34" width="120" height="224" rx="6" fill="url(#gloss)" opacity=".18" />
      <Fan cx={182} cy={72} r={26} a={a} n={8} /><Fan cx={182} cy={132} r={26} a={a} n={8} />
      <rect x="140" y="176" width="86" height="22" rx="3" fill="#171b24" stroke={a} strokeOpacity=".5" />
      <rect x="140" y="206" width="86" height="14" rx="3" fill="#171b24" />
      <rect x="252" y="48" width="26" height="170" rx="4" fill="#0f1218" />{[60, 80, 100, 120].map((y) => <circle key={y} cx="265" cy={y} r="3" fill={a} opacity=".9" />)}
      <rect x="130" y="268" width="14" height="8" rx="2" fill="#0b0d12" /><rect x="256" y="268" width="14" height="8" rx="2" fill="#0b0d12" />
    </g>
  );
}
export function Laptop({ c, c2, c3, a, id, o }) {
  return (
    <g>
      {o.rgb && <ellipse cx="200" cy="246" rx="150" ry="10" fill={a} opacity=".35" filter="url(#blur6)" />}
      <rect x="86" y="40" width="228" height="150" rx="9" fill={c3} />
      <Screen x={94} y={48} w={212} h={134} a={a} id={id} r={3} />
      <path d="M62 194 H338 L360 232 Q362 242 350 242 H50 Q38 242 40 232 Z" fill={`url(#${id}p)`} />
      <path d="M150 194 H250 L246 200 H154 Z" fill="#00000050" />
      <g fill="#0b0d12" opacity=".75">{[0, 1, 2].map((r) => <rect key={r} x={84 + r * 6} y={204 + r * 7} width={232 - r * 12} height="4" rx="2" />)}</g>
      <rect x="168" y="226" width="64" height="9" rx="3" fill="#0b0d12" opacity=".5" />
    </g>
  );
}
export function Case({ c, c2, a, id, o }) { return <Tower c={c} c2={c2} a={a} id={id} o={o} />; }

/* ── Speakers / webcam / stand / etc. ──────────────────────────────────────────── */
const Sat = ({ x, c, a, id, s = 1 }) => (
  <g transform={`translate(${x} ${s === 1 ? 70 : 100})`}>
    <rect width="86" height="170" rx="10" fill={`url(#${id}p)`} />
    <circle cx="43" cy="42" r="14" fill="#0b0d12" stroke={a} strokeOpacity=".7" /><circle cx="43" cy="112" r="30" fill="#0b0d12" stroke="#2b3140" strokeWidth="3" /><circle cx="43" cy="112" r="12" fill="#14171e" /><circle cx="43" cy="112" r="34" fill="none" stroke={a} strokeOpacity=".6" />
  </g>
);
export function Speaker({ c, a, id, o }) {
  return (
    <g>
      <Sat x={44} c={c} a={a} id={id} />
      <Sat x={270} c={c} a={a} id={id} />
      {(<g transform="translate(150 150)"><rect width="100" height="110" rx="10" fill={darken(c, .2)} stroke="#2b3140" /><circle cx="50" cy="56" r="34" fill="#0b0d12" stroke={a} strokeOpacity=".5" strokeWidth="2" /><circle cx="50" cy="56" r="14" fill="#14171e" /></g>)}
    </g>
  );
}
export function Webcam({ c, c2, c3, a, id }) {
  return (
    <g>
      <path d="M150 228 Q200 196 250 228 V240 H150 Z" fill={c2} />
      <rect x="192" y="168" width="16" height="40" fill={c3} />
      <rect x="132" y="68" width="136" height="100" rx="30" fill={`url(#${id}p)`} />
      <circle cx="200" cy="118" r="38" fill="#080a0f" stroke="#2b3140" strokeWidth="3" />
      <circle cx="200" cy="118" r="26" fill="#10172a" /><circle cx="200" cy="118" r="26" fill="none" stroke={a} strokeOpacity=".7" strokeWidth="2" />
      <circle cx="190" cy="108" r="6" fill="#fff" opacity=".28" /><circle cx="248" cy="82" r="3" fill={a} />
    </g>
  );
}
export function Stand({ c, c2, c3, a, id }) {
  return (
    <g>
      <ellipse cx="200" cy="254" rx="72" ry="12" fill={c2} /><ellipse cx="200" cy="250" rx="72" ry="12" fill={`url(#${id}p)`} /><ellipse cx="200" cy="250" rx="60" ry="8" fill="none" stroke={a} strokeWidth="2.5" opacity=".95" />
      <rect x="192" y="76" width="16" height="174" fill={c3} />
      <rect x="150" y="44" width="100" height="40" rx="20" fill={`url(#${id}p)`} />
      <path d="M160 70 Q200 56 240 70" fill="none" stroke={a} strokeWidth="2" opacity=".8" />
    </g>
  );
}
export function Dongle({ c, a, id }) {
  return (<g><rect x="70" y="124" width="60" height="52" fill="#aeb5c2" /><rect x="76" y="132" width="48" height="12" fill="#13161c" /><rect x="76" y="156" width="48" height="12" fill="#13161c" /><rect x="130" y="112" width="190" height="76" rx="14" fill={`url(#${id}p)`} /><circle cx="156" cy="150" r="5" fill={a} /></g>);
}
export function Light({ c, a, id }) {
  return (
    <g>
      <rect x="70" y="60" width="260" height="170" rx="10" fill="#0c0f16" stroke="#2b3140" /><rect x="80" y="70" width="240" height="150" rx="4" fill={`url(#${id}scr)`} />
      <rect x="60" y="120" width="280" height="14" rx="7" fill="#12151c" /><rect x="60" y="120" width="280" height="14" rx="7" fill={a} opacity=".95" />
      <rect x="60" y="120" width="280" height="14" rx="7" fill={a} opacity=".5" filter="url(#blur6)" />
    </g>
  );
}
export function Arm({ c, c2, c3, a, id }) {
  return (
    <g>
      <rect x="40" y="230" width="90" height="12" rx="3" fill={c3} /><rect x="76" y="242" width="18" height="30" rx="2" fill={c2} />
      <rect x="78" y="90" width="14" height="144" fill={`url(#${id}p)`} />
      <path d="M85 98 H220 V86" fill="none" stroke={c} strokeWidth="14" strokeLinejoin="round" />
      <rect x="198" y="40" width="70" height="80" rx="6" fill="#12151c" stroke={a} />
      <rect x="296" y="40" width="64" height="80" rx="6" fill="#0c0f16" opacity=".6" />
    </g>
  );
}
export function Bag({ c, c2, c3, a, id }) {
  return (
    <g>
      <rect x="110" y="40" width="180" height="228" rx="40" fill={`url(#${id}p)`} />
      <rect x="130" y="150" width="140" height="84" rx="18" fill={c2} /><path d="M142 190 H258" stroke={a} strokeWidth="3" />
      <path d="M170 40 Q200 14 230 40" fill="none" stroke={c3} strokeWidth="9" strokeLinecap="round" />
      <rect x="130" y="76" width="140" height="56" rx="14" fill={c2} opacity=".7" /><path d="M146 104 H254" stroke={a} strokeWidth="3" />
    </g>
  );
}

/* ── Sim gear ─────────────────────────────────────────────────────────────────── */
export function Wheel({ c, c2, c3, cl, a, id, o }) {
  const cx = o.pedals ? 150 : 200, cy = 140, R = 92;
  return (
    <g>
      {o.pedals && <g transform="translate(284 150)">{[0, 1, 2].map((i) => (<g key={i} transform={`translate(${i * 32 - 12} 0)`}><path d="M0 0 H24 L28 100 H-4 Z" fill={`url(#${id}p)`} stroke="#2b3140" /><path d="M2 20 H22 M2 40 H22 M2 60 H22" stroke="#00000060" strokeWidth="3" /></g>))}<rect x="-14" y="98" width="88" height="8" rx="3" fill="#0b0d12" /></g>}
      <rect x={cx - 24} y={cy + 64} width="48" height="82" rx="8" fill={c2} />
      <rect x={cx - 40} y={cy + 128} width="80" height="12" rx="4" fill={c3} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={c3} strokeWidth="28" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={c} strokeWidth="22" />
      <circle cx={cx} cy={cy} r={R + 10} fill="none" stroke={cl} strokeOpacity=".16" strokeWidth="1.5" />
      <path d={`M${cx - 10} ${cy - R - 6} h20`} stroke={a} strokeWidth="6" strokeLinecap="round" />
      <path d={`M${cx - R + 6} ${cy + 6} H${cx + R - 6}`} stroke={c2} strokeWidth="18" /><path d={`M${cx} ${cy} V${cy + R - 16}`} stroke={c2} strokeWidth="18" />
      <circle cx={cx} cy={cy} r="30" fill={c2} stroke={cl} strokeOpacity=".25" /><circle cx={cx} cy={cy} r="14" fill={a} opacity=".9" />
      {[[-50, -4], [50, -4]].map(([x, y], i) => <circle key={i} cx={cx + x} cy={cy + y} r="6" fill={i ? '#e5483f' : '#4a8cf0'} />)}
      <rect x={cx - R - 18} y={cy - 24} width="10" height="50" rx="4" fill={c2} /><rect x={cx + R + 8} y={cy - 24} width="10" height="50" rx="4" fill={c2} />
    </g>
  );
}
export function Pedals({ c, c2, a, id }) {
  return (
    <g>
      <rect x="60" y="238" width="280" height="16" rx="5" fill="#0b0d12" />
      {[0, 1, 2].map((i) => (<g key={i} transform={`translate(${96 + i * 76} 50)`}><path d="M0 0 H52 L60 188 H-8 Z" fill={`url(#${id}p)`} stroke="#2b3140" /><path d="M10 34 H46 M10 64 H46 M10 94 H46 M10 124 H46" stroke="#00000060" strokeWidth="4" /><rect x="-4" y="170" width="68" height="6" fill={a} opacity=".9" /></g>))}
    </g>
  );
}
export function Shifter({ c, c2, c3, a, id }) {
  return (
    <g>
      <rect x="110" y="196" width="180" height="62" rx="10" fill={`url(#${id}p)`} /><rect x="110" y="196" width="180" height="5" fill={a} />
      <rect x="130" y="206" width="140" height="40" rx="5" fill="#0b0d12" stroke="#2b3140" />
      <path d="M150 218 H250 M150 218 V238 M200 218 V238 M250 218 V238" stroke="#4b5568" strokeWidth="3" />
      <rect x="194" y="100" width="12" height="108" fill={c3} /><ellipse cx="200" cy="82" rx="30" ry="34" fill={`url(#${id}p)`} /><path d="M184 76 Q200 64 216 76" stroke={a} strokeWidth="3" fill="none" />
    </g>
  );
}
export function PadMat({ c, c2, c3, a, id, o }) {
  return (
    <g>
      {o.glow && <rect x="26" y="96" width="348" height="130" rx="14" fill={a} opacity=".4" filter="url(#blur6)" />}
      <path d="M44 100 H356 L372 218 H28 Z" fill={`url(#${id}p)`} />
      <path d="M44 100 H356 L372 218 H28 Z" fill="none" stroke={a} strokeOpacity=".6" strokeWidth="2.5" strokeDasharray="5 4" transform="translate(0 0) scale(.985) translate(3 2)" />
      <path d="M92 150 H190 L202 190 H78 Z" fill={a} opacity=".12" />
      <circle cx="256" cy="162" r="26" fill={a} opacity=".12" />
    </g>
  );
}

/* ── Composite: Full gaming setup (front-on elevation) ─────────────────────────── */
export function Setup({ c3, a, id, o }) {
  const mons = o.mon || 1;
  const console_ = o.console;
  return (
    <g>
      <rect x="0" y="0" width="400" height="300" fill="#0b0f18" opacity="0" />
      {/* wall glow */}
      <ellipse cx="200" cy="110" rx="170" ry="70" fill={a} opacity=".16" filter="url(#blur6)" />
      {console_ ? (
        <g>
          <rect x="70" y="64" width="190" height="112" rx="6" fill="#0b0f18" stroke="#2a3346" strokeWidth="3" /><Screen x={76} y={70} w={178} h={100} a={a} id={id} />
          <rect x="150" y="176" width="30" height="10" fill="#1b2130" /><rect x="125" y="184" width="80" height="6" rx="3" fill="#1b2130" />
          <g transform="translate(284 100)">
            {console_ === 'ps5' && <g><rect x="14" y="0" width="16" height="80" rx="6" fill="#eceff4" /><rect x="22" y="0" width="3" height="80" fill="#12141b" /></g>}
            {console_ === 'xbox' && <rect x="0" y="6" width="42" height="74" rx="3" fill="#14171e" stroke={a} strokeOpacity=".4" />}
            {console_ === 'switch' && <g><rect x="-6" y="30" width="54" height="34" rx="6" fill="#1a1d25" /><rect x="-12" y="30" width="10" height="34" rx="5" fill="#38c1e6" /><rect x="48" y="30" width="10" height="34" rx="5" fill="#ff5a5a" /></g>}
          </g>
          <path d="M120 232 C128 214 160 210 170 224 C174 238 164 246 154 238 H136 C128 246 118 240 120 232 Z" fill="#cfd5df" /><path d="M210 232 C218 214 250 210 260 224 C264 238 254 246 244 238 H226 C218 246 208 240 210 232 Z" fill="#2a2f3a" />
        </g>
      ) : (
        <g>
          {mons === 1 && <><rect x="110" y="56" width="180" height="104" rx="6" fill="#0b0f18" stroke="#2a3346" strokeWidth="3" /><Screen x={116} y={62} w={168} h={92} a={a} id={id} /></>}
          {mons === 2 && [0, 1].map((i) => <g key={i}><rect x={70 + i * 132} y="64" width="124" height="86" rx="5" fill="#0b0f18" stroke="#2a3346" strokeWidth="3" /><Screen x={75 + i * 132} y={69} w={114} h={76} a={a} id={id} /></g>)}
          {mons === 3 && <><rect x="108" y="60" width="184" height="88" rx="5" fill="#0b0f18" stroke="#2a3346" strokeWidth="3" /><Screen x={113} y={65} w={174} h={78} a={a} id={id} />
            {[0, 1].map((i) => <g key={i}><rect x={i ? 298 : 42} y="74" width="62" height="76" rx="4" fill="#0b0f18" stroke="#2a3346" strokeWidth="3" /><Screen x={(i ? 298 : 42) + 4} y={78} w={54} h={68} a={a} id={id} /></g>)}</>}
          <rect x="190" y="150" width="20" height="26" fill="#1b2130" /><rect x="164" y="170" width="72" height="6" rx="3" fill="#1b2130" />
        </g>
      )}
      {/* desk */}
      <rect x="30" y="178" width="340" height="14" rx="4" fill="#202738" /><rect x="30" y="178" width="340" height="3" fill={a} />
      <rect x="54" y="192" width="8" height="82" fill="#161b27" /><rect x="338" y="192" width="8" height="82" fill="#161b27" />
      {!console_ && <g><rect x="148" y="166" width="104" height="10" rx="3" fill="#2a3042" /><rect x="268" y="168" width="18" height="9" rx="4" fill="#2a3042" /></g>}
      {o.wheel && <g transform="translate(150 190)"><circle cx="50" cy="26" r="28" fill="none" stroke="#2a3042" strokeWidth="9" /><circle cx="50" cy="26" r="6" fill={a} /></g>}
      {!console_ && <path d="M310 170 C310 150 346 150 346 170" fill="none" stroke="#2a3042" strokeWidth="6" strokeLinecap="round" />}
      {/* chair */}
      {!console_ && <g transform="translate(-6 0)"><rect x="304" y="200" width="46" height="60" rx="14" fill={a} opacity=".9" /><rect x="312" y="260" width="30" height="6" fill="#1b2130" /></g>}
    </g>
  );
}
