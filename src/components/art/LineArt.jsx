import w from '../landing/WorldArt.module.css';
import s from './LineArt.module.css';

/* Ink line drawings in the landing-page style. They read `--ink` (stroke) and `--paper` (fill) from the parent,
   so the same drawing works on a light card and on a dark stage. All are drawn in a 200×150 box. */

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const PAD = 'M30 20 C50 10 110 10 130 20 C146 28 156 52 158 80 C160 100 150 110 138 106 C126 102 120 86 108 80 L52 80 C40 86 34 102 22 106 C10 110 0 100 2 80 C4 52 14 28 30 20 Z';

const ART = {
  monitor: () => (
    <>
      <path d="M76 134 h48 l-6 -10 h-36 z" className={w.i} />
      <rect x="94" y="106" width="12" height="20" className={w.i} />
      <rect x="28" y="16" width="144" height="92" rx="7" className={w.i} />
      <rect x="36" y="24" width="128" height="74" rx="2" className={w.ink} />
      <circle cx="140" cy="44" r="7" className={w.amber} />
      <path d="M36 98 L60 70 L78 84 L102 58 L126 80 L142 68 L164 88 L164 98 Z" className={s.hills} />
      <rect x="36" y="24" width="128" height="3" className={s.scan} />
      <circle cx="164" cy="103" r="1.8" className={s.led} />
    </>
  ),
  keyboard: () => (
    <>
      <path d="M100 46 C100 28 128 22 154 10" className={w.in} />
      <rect x="14" y="46" width="172" height="66" rx="9" className={w.i} />
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 13 }, (_, c) => {
        if (r === 3 && c > 3 && c < 9) return c === 4 ? <rect key={`${r}-${c}`} x={23 + c * 12.4} y={55 + r * 12.6} width={12.4 * 5 - 2.4} height="10" rx="2" className={s.key} style={{ animationDelay: `${-c * 0.12}s` }} /> : null;
        return <rect key={`${r}-${c}`} x={23 + c * 12.4} y={55 + r * 12.6} width="10" height="10" rx="2" className={s.key} style={{ animationDelay: `${-c * 0.12 - r * 0.05}s` }} />;
      }))}
    </>
  ),
  headset: () => (
    <>
      <g className={s.waves}><path d="M172 94 q8 11 0 22" /><path d="M181 88 q13 17 0 34" /></g>
      <path d="M52 98 C52 44 76 22 100 22 C124 22 148 44 148 98" className={w.in} />
      <path d="M62 98 C62 52 80 32 100 32 C120 32 138 52 138 98" className={w.in} />
      <rect x="36" y="86" width="28" height="48" rx="13" className={w.i} />
      <rect x="136" y="86" width="28" height="48" rx="13" className={w.i} />
      <rect x="58" y="92" width="9" height="36" rx="4.5" className={w.i} />
      <rect x="133" y="92" width="9" height="36" rx="4.5" className={w.i} />
      <path d="M41 98 V122 M159 98 V122" className={s.rgbLine} />
      <path d="M42 128 C40 142 58 148 78 144" className={w.in} />
      <circle cx="81" cy="144" r="3.6" className={w.coral} />
    </>
  ),
  mouse: () => (
    <>
      <ellipse cx="100" cy="132" rx="46" ry="7" className={s.glow} />
      <path d="M100 22 C100 10 124 4 156 8" className={w.in} />
      <path d="M100 22 C128 22 140 44 140 74 C140 108 124 128 100 128 C76 128 60 108 60 74 C60 44 72 22 100 22 Z" className={w.i} />
      <path d="M100 22 V62 M62 62 C80 68 120 68 138 62" className={w.in} />
      <rect x="96" y="32" width="8" height="18" rx="4" className={w.ink} />
      <path d="M97 36 h6 M97 42 h6" className={s.wheel} />
      <path d="M93 102 l7 -9 7 9" className={s.rgbLine} />
    </>
  ),
  chair: () => (
    <g className={s.swivel}>
      <path d="M100 128 L60 138 M100 128 L140 138 M100 128 L78 145 M100 128 L122 145" className={w.in} />
      {[[60, 140], [140, 140], [78, 146], [122, 146]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" className={w.i} />)}
      <rect x="95" y="110" width="10" height="20" rx="2" className={w.i} />
      <rect x="53" y="86" width="5" height="18" className={w.i} />
      <rect x="142" y="86" width="5" height="18" className={w.i} />
      <path d="M58 102 C58 94 76 92 100 92 C124 92 142 94 142 102 C142 110 124 114 100 114 C76 114 58 110 58 102 Z" className={w.i} />
      <path d="M70 16 C70 7 80 3 100 3 C120 3 130 7 130 16 L134 86 C134 96 124 100 100 100 C76 100 66 96 66 86 Z" className={w.i} />
      <rect x="80" y="14" width="10" height="13" rx="4" className={w.ink} />
      <rect x="110" y="14" width="10" height="13" rx="4" className={w.ink} />
      <path d="M96 8 V97 M104 8 V97" className={s.stripe} />
      <rect x="44" y="82" width="22" height="6" rx="3" className={w.i} />
      <rect x="134" y="82" width="22" height="6" rx="3" className={w.i} />
    </g>
  ),
  tablet: () => (
    <>
      <rect x="28" y="18" width="144" height="106" rx="11" className={w.i} />
      <rect x="38" y="28" width="124" height="86" rx="4" className={w.soft} />
      <path d="M52 92 C70 58 86 104 104 72 S136 48 148 62" pathLength="1" className={s.sketch} />
      <g className={s.pen}><path d="M150 60 L180 26" className={s.penBody} /><path d="M150 60 l-3 6 6 -3" className={w.ink} /></g>
      <circle cx="100" cy="23" r="1.6" className={w.ink} />
    </>
  ),
  powerbank: () => (
    <>
      <path d="M100 30 C100 12 130 8 162 14" className={s.cable} />
      <rect x="93" y="24" width="14" height="8" rx="2" className={w.ink} />
      <rect x="56" y="30" width="88" height="104" rx="15" className={w.i} />
      <path d="M104 52 l-12 22 h10 l-5 18 15 -24 h-10 l5 -16z" className={w.amber} />
      {[0, 1, 2, 3].map((n) => <circle key={n} cx={82 + n * 12} cy="114" r="3.4" className={s.level} style={{ animationDelay: `${n * 0.4}s` }} />)}
    </>
  ),
  controller: () => (
    <g transform="translate(20 22)">
      <g className={s.float}>
        <path d={PAD} className={w.i} />
        <rect x="56" y="22" width="48" height="30" rx="6" className={w.soft} />
        <path d="M53 27 V48 M107 27 V48" className={s.rgbLine} />
        {[[58, 68], [102, 68]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="10.5" className={w.i} /><circle cx={x} cy={y} r="5.5" className={w.ink} /></g>)}
        <path d="M23 44 h18 M32 35 v18" className={s.dpad} />
        {[[128, 33], [139, 44], [128, 55], [117, 44]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.8" className={s.face} style={{ animationDelay: `${i * 0.35}s` }} />)}
      </g>
    </g>
  ),
  shelf: () => (
    <>
      <path d="M18 8 V146 M182 8 V146" className={w.in} />
      <rect x="14" y="60" width="172" height="6" rx="2" className={w.i} />
      <rect x="14" y="110" width="172" height="6" rx="2" className={w.i} />
      <rect x="28" y="26" width="42" height="34" rx="3" className={w.i} />
      <path d="M36 36 h20 M36 44 h14" className={w.in} />
      <g className={s.tilt}><rect x="78" y="22" width="11" height="38" rx="2" className={w.amber} /></g>
      <rect x="91" y="22" width="11" height="38" rx="2" className={w.blueFill} />
      <rect x="104" y="22" width="11" height="38" rx="2" className={w.i} />
      <rect x="124" y="34" width="48" height="26" rx="4" className={w.i} />
      <circle cx="136" cy="47" r="5" className={w.in} />
      <path d="M150 42 h14 M150 50 h10" className={w.in} />
      <g className={s.hop}><rect x="28" y="72" width="54" height="38" rx="3" className={w.coral} /><path d="M28 84 h54" className={w.in} /></g>
      <rect x="92" y="80" width="38" height="30" rx="3" className={w.i} />
      <path d="M102 98 C102 88 120 88 120 98" className={w.in} />
      <rect x="140" y="88" width="32" height="22" rx="3" className={w.amber} />
      <path d="M18 146 h164" className={w.in} />
    </>
  ),
  bag: () => (
    <>
      <g className={s.peek}>
        <rect x="112" y="18" width="20" height="40" rx="2" transform="rotate(12 122 38)" className={w.amber} />
        <path d="M60 52 C64 36 92 34 98 50" className={w.i} />
        <circle cx="72" cy="46" r="3" className={w.ink} />
        <circle cx="86" cy="45" r="3" className={w.ink} />
      </g>
      <path d="M74 52 C74 18 126 18 126 52" className={w.in} />
      <path d="M44 52 L156 52 L148 142 L52 142 Z" className={w.i} />
      <path d="M50 64 H150" className={s.stitch} />
      <g transform="translate(86 86)">{HEART.flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? <rect key={`${x}-${y}`} x={x * 4} y={y * 4} width="4.1" height="4.1" className={s.px} /> : null)))}</g>
    </>
  ),
  receipt: () => (
    <>
      <g className={s.print}>
        <path d="M62 14 L68 20 L74 14 L80 20 L86 14 L92 20 L98 14 L104 20 L110 14 L116 20 L122 14 L128 20 L134 14 L138 18 V100 H62 Z" className={w.i} />
        <path d="M72 32 h40 M72 42 h52 M72 52 h30 M72 62 h44" className={w.in} />
        <path d="M72 76 h28 M112 76 h16" className={s.total} />
      </g>
      <rect x="34" y="88" width="132" height="50" rx="12" className={w.i} />
      <rect x="54" y="92" width="92" height="6" rx="3" className={w.ink} />
      <circle cx="146" cy="120" r="4" className={s.led} />
      <path d="M52 120 h40" className={w.in} />
    </>
  ),
  trophy: () => (
    <>
      <g className={s.sparkle}>
        <path d="M40 30 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
        <path d="M164 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path d="M150 14 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
      </g>
      <path d="M70 30 C50 30 50 62 74 64 M130 30 C150 30 150 62 126 64" className={w.in} />
      <path d="M70 18 H130 V52 C130 74 116 88 100 88 C84 88 70 74 70 52 Z" className={w.amber} />
      <path d="M100 36 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" className={w.white} />
      <rect x="94" y="88" width="12" height="18" className={w.amber} />
      <rect x="74" y="106" width="52" height="12" rx="2" className={w.i} />
      <rect x="64" y="118" width="72" height="20" rx="3" className={w.ink} />
      <path d="M78 26 C78 44 80 56 86 64" className={s.shine} />
    </>
  ),
  vs: () => (
    <>
      <g className={s.left}>
        <rect x="16" y="22" width="66" height="104" rx="10" className={w.i} />
        <path d="M30 78 C30 52 40 42 49 42 C58 42 68 52 68 78" className={w.in} />
        <rect x="25" y="72" width="10" height="20" rx="5" className={w.i} />
        <rect x="63" y="72" width="10" height="20" rx="5" className={w.i} />
        <path d="M28 108 h42" className={w.in} />
      </g>
      <g className={s.right}>
        <rect x="118" y="22" width="66" height="104" rx="10" className={w.i} />
        <rect x="128" y="56" width="46" height="26" rx="4" className={w.i} />
        <path d="M134 64 h34 M134 72 h34" className={w.in} />
        <path d="M130 108 h42" className={w.in} />
      </g>
      <g className={s.vsBadge}>
        <circle cx="100" cy="74" r="20" className={w.coral} />
        <text x="100" y="79.5" textAnchor="middle" className={s.vsText}>VS</text>
      </g>
    </>
  ),
  tag: () => (
    <>
      <path d="M34 8 C44 40 60 64 78 80" className={w.in} />
      <g className={s.swing}>
        <path d="M58 80 L84 52 H166 V108 H84 Z" className={w.coral} />
        <circle cx="76" cy="80" r="4.5" className={w.white} />
        <text x="126" y="92" textAnchor="middle" className={s.pct}>%</text>
      </g>
    </>
  ),
  heart: () => (
    <>
      <g className={s.sparkle}>
        <path d="M34 34 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
        <path d="M166 100 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
      </g>
      <g className={s.beat}>{HEART.flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? <rect key={`${x}-${y}`} x={58 + x * 12} y={38 + y * 12} width="12.2" height="12.2" className={s.pxBig} /> : null)))}</g>
    </>
  ),
};

export const LINE_TYPES = Object.keys(ART);

export default function LineArt({ type, className }) {
  const Draw = ART[type] || ART.controller;
  return <svg viewBox="0 0 200 150" className={`${w.art} ${s.root} ${className || ''}`} aria-hidden="true"><Draw /></svg>;
}
