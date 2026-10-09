import s from './PlatformArt.module.css';

/* Line drawings of each platform. They are re-mounted on every switch, so the draw-in replays. */
const D = { pathLength: 1, className: s.d };
const DN = { pathLength: 1, className: s.dn };

const PAD_BODY = 'M30 20 C50 10 110 10 130 20 C146 28 156 52 158 80 C160 100 150 110 138 106 C126 102 120 86 108 80 L52 80 C40 86 34 102 22 106 C10 110 0 100 2 80 C4 52 14 28 30 20 Z';

function Shadow({ cx, w = 130 }) {
  return <ellipse cx={cx} cy="306" rx={w} ry="10" className={s.shadow} />;
}

function Controller({ x, y, layout = 'ps' }) {
  const ps = layout === 'ps';
  const sticks = ps ? [[58, 68], [102, 68]] : [[34, 44], [102, 70]];
  const dpad = ps ? [32, 44] : [58, 70];
  const face = [128, 44];
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={s.float}>
        <path d={PAD_BODY} {...D} style={{ '--d': '.35s' }} />
        {ps ? (
          <>
            <rect x="56" y="22" width="48" height="30" rx="6" {...DN} style={{ '--d': '.5s' }} />
            <path d="M53 27 V48 M107 27 V48" className={s.glowLine} />
          </>
        ) : (
          <>
            <circle cx="80" cy="34" r="7" className={s.home} />
            <path d="M68 52 h7 M85 52 h7" {...DN} style={{ '--d': '.5s' }} />
          </>
        )}
        {sticks.map(([cx, cy]) => (
          <g key={cx}>
            <circle cx={cx} cy={cy} r="10.5" {...D} style={{ '--d': '.55s' }} />
            <circle cx={cx} cy={cy} r="5.5" {...DN} style={{ '--d': '.6s' }} />
          </g>
        ))}
        <path d={`M${dpad[0] - 9} ${dpad[1]} h18 M${dpad[0]} ${dpad[1] - 9} v18`} {...DN} style={{ '--d': '.6s', strokeWidth: 4.5 }} />
        {[[0, -11], [11, 0], [0, 11], [-11, 0]].map(([dx, dy], i) => (
          <circle key={i} cx={face[0] + dx} cy={face[1] + dy} r="4.6" className={s.face} style={{ animationDelay: `${1.2 + i * 0.3}s` }} />
        ))}
      </g>
    </g>
  );
}

function PlayStation() {
  return (
    <>
      <Shadow cx="190" w="150" />
      <g style={{ '--d': '0s' }}>
        <ellipse cx="151" cy="300" rx="36" ry="6" {...D} />
        <path d="M138 298 L124 298 C118 220 114 130 106 52 C105 42 114 36 124 40 L138 60 Z" {...D} className={`${s.d} ${s.light}`} />
        <path d="M164 298 L178 298 C184 220 188 130 196 52 C197 42 188 36 178 40 L164 60 Z" {...D} className={`${s.d} ${s.light}`} />
        <rect x="138" y="58" width="26" height="240" rx="4" {...D} className={`${s.d} ${s.dark}`} />
        <path d="M145 270 h12 M145 278 h6" {...DN} />
      </g>
      <path d="M138.5 64 V292 M163.5 64 V292" className={s.glowLine} />
      <Controller x="226" y="196" />
    </>
  );
}

function Switch() {
  return (
    <>
      <Shadow cx="210" w="150" />
      <g className={s.joyL}>
        <path d="M120 112 L100 112 C86 112 78 122 78 136 L78 196 C78 210 86 220 100 220 L120 220 Z" {...D} className={`${s.d} ${s.joyRed}`} />
        <circle cx="100" cy="140" r="9" {...D} />
        {[[0, -9], [9, 0], [0, 9], [-9, 0]].map(([dx, dy], i) => <circle key={i} cx={100 + dx} cy={186 + dy} r="3.4" {...D} />)}
        <path d="M104 122 h8" {...DN} />
      </g>
      <g className={s.joyR}>
        <path d="M300 112 L320 112 C334 112 342 122 342 136 L342 196 C342 210 334 220 320 220 L300 220 Z" {...D} className={`${s.d} ${s.joyBlue}`} />
        <circle cx="320" cy="190" r="9" {...D} />
        {[[0, -9], [9, 0], [0, 9], [-9, 0]].map(([dx, dy], i) => <circle key={i} cx={320 + dx} cy={142 + dy} r="3.4" {...D} />)}
        <path d="M308 122 h8 M312 118 v8" {...DN} />
      </g>
      <rect x="120" y="112" width="180" height="108" rx="5" {...D} className={`${s.d} ${s.dark}`} />
      <g className={s.screenOn}>
        <rect x="131" y="122" width="158" height="88" rx="2" className={s.lcd} />
        <line x1="210" y1="126" x2="210" y2="206" className={s.net} />
        <rect x="137" y="150" width="4" height="22" className={`${s.px} ${s.padL}`} />
        <rect x="279" y="150" width="4" height="22" className={`${s.px} ${s.padR}`} />
        <g className={s.ballX}><rect x="144" y="0" width="5" height="5" className={`${s.px} ${s.ballY}`} /></g>
        <text x="190" y="138" className={s.score} textAnchor="end">3</text>
        <text x="230" y="138" className={s.score}>2</text>
      </g>
      <path d="M118 118 l-6 -6 M118 214 l-6 6 M302 118 l6 -6 M302 214 l6 6" className={s.click} />
    </>
  );
}

function Xbox() {
  return (
    <>
      <Shadow cx="200" w="150" />
      <g className={s.heat}>{[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={168 + i * 11} cy="44" r="2" style={{ animationDelay: `${i * 0.45}s` }} />)}</g>
      <g style={{ '--d': '0s' }}>
        <path d="M230 70 L258 50 L258 280 L230 300 Z" {...D} className={`${s.d} ${s.dark}`} />
        <path d="M120 70 L148 50 L258 50 L230 70 Z" {...D} className={`${s.d} ${s.light}`} />
        <rect x="120" y="70" width="110" height="230" rx="3" {...D} />
        <path d="M212 96 V196" {...DN} />
        <path d="M134 280 h10" {...DN} />
      </g>
      <ellipse cx="189" cy="60" rx="38" ry="7" className={s.vent} />
      <g className={s.ventDots}>{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={159 + i * 7.5} cy={60 + (i % 2 ? 1.6 : -1.6)} r="1.4" />)}</g>
      <circle cx="140" cy="90" r="4.5" className={s.power} />
      <Controller x="222" y="200" layout="xbox" />
    </>
  );
}

function PC() {
  const fan = (cx, cy, r, key, dur = '1.1s') => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={r} {...D} />
      <circle cx={cx} cy={cy} r={r - 2.5} className={s.rgbRing} />
      <g className={s.spin} style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: dur }}>
        {[0, 72, 144, 216, 288].map((a) => <path key={a} d={`M${cx} ${cy} q${r * 0.55} ${-r * 0.2} ${r * 0.72} ${-r * 0.62}`} transform={`rotate(${a} ${cx} ${cy})`} className={s.blade} />)}
      </g>
      <circle cx={cx} cy={cy} r={r * 0.22} {...D} />
    </g>
  );
  return (
    <>
      <Shadow cx="200" w="150" />
      <g style={{ '--d': '0s' }}>
        <rect x="90" y="36" width="220" height="266" rx="8" {...D} className={`${s.d} ${s.dark}`} />
        <rect x="102" y="48" width="196" height="242" rx="4" {...DN} />
        <rect x="156" y="58" width="134" height="160" rx="3" {...DN} className={`${s.dn} ${s.faint}`} />
        <rect x="102" y="236" width="196" height="54" rx="2" {...D} />
        <path d="M120 252 h44 M120 262 h44 M120 272 h44" {...DN} className={`${s.dn} ${s.faint}`} />
        <rect x="150" y="176" width="140" height="34" rx="4" {...D} />
      </g>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={258 + i * 7} y="74" width="4" height="62" rx="1" className={s.ram} style={{ animationDelay: `${-i * 0.35}s` }} />)}
      {fan(124, 82, 20, 'f1')}
      {fan(124, 130, 20, 'f2')}
      {fan(124, 178, 20, 'f3')}
      {fan(222, 112, 26, 'cpu', '0.9s')}
      <path d="M154 206 H286" className={s.gpuLed} />
      <text x="270" y="198" className={s.tag} textAnchor="end">GPU</text>
    </>
  );
}

const ART = { playstation: PlayStation, switch: Switch, xbox: Xbox, pc: PC };

export default function PlatformArt({ id }) {
  const Art = ART[id];
  return (
    <svg viewBox="0 0 420 340" className={s.art} aria-hidden="true">
      <Art />
    </svg>
  );
}

/* 24px tab icons */
export function PlatformIcon({ id }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" {...p}>
      {id === 'playstation' && <><path d="M9.5 21H7.6c-.4-6-.7-11-1.4-16.4C6.1 3.6 7 3 8 3.4L9.5 5" /><path d="M14.5 21h1.9c.4-6 .7-11 1.4-16.4.1-1-.8-1.6-1.8-1.2L14.5 5" /><rect x="9.5" y="4.6" width="5" height="16.4" rx="1" /></>}
      {id === 'switch' && <><rect x="6.5" y="6.5" width="11" height="11" rx="1" /><path d="M6.5 6.5H5a2.5 2.5 0 0 0-2.5 2.5v6A2.5 2.5 0 0 0 5 17.5h1.5M17.5 6.5H19a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-1.5" /><circle cx="4.6" cy="9.4" r=".6" fill="currentColor" /><circle cx="19.4" cy="14.6" r=".6" fill="currentColor" /></>}
      {id === 'xbox' && <><path d="M6 6.5 9 4h9l-3 2.5" /><path d="M15 6.5 18 4v14.5L15 21" /><rect x="6" y="6.5" width="9" height="14.5" rx=".8" /><ellipse cx="12" cy="5.2" rx="2.4" ry=".6" /></>}
      {id === 'pc' && <><rect x="5" y="2.5" width="14" height="19" rx="1.6" /><circle cx="9" cy="8" r="2.4" /><circle cx="9" cy="14.5" r="2.4" /><path d="M13.5 12h3.5M13.5 18.5h3.5" /></>}
    </svg>
  );
}
