import s from './WorldArt.module.css';

/* Ink drawings for the categories beyond consoles. Small, slow loops; hover speeds nothing up, it only lifts the tile. */

function Figure() {
  return (
    <svg viewBox="0 0 200 200" className={s.art} aria-hidden="true">
      <rect x="40" y="10" width="120" height="150" rx="10" className={s.box} />
      <g className={s.sparkle}>
        <path d="M150 34 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
        <path d="M164 58 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
      </g>
      <g className={s.cape}><path d="M88 74 C72 100 64 136 58 166 L100 156 L113 74 Z" className={s.coral} /></g>
      <path d="M52 176 v8 a48 9 0 0 0 96 0 v-8" className={s.i} />
      <ellipse cx="100" cy="176" rx="48" ry="9" className={s.i} />
      <path d="M90 118 L88 170 L98 170 L100 130 L102 170 L112 170 L110 118 Z" className={s.i} />
      <path d="M84 72 C84 65 116 65 116 72 L112 120 L88 120 Z" className={s.i} />
      <path d="M100 82 l7 9 -7 9 -7 -9z" className={s.coral} />
      <path d="M88 113 H112" className={s.in} />
      <path d="M84 76 C76 88 74 100 80 110" className={s.in} />
      <circle cx="81" cy="112" r="4.2" className={s.i} />
      <g className={s.punch}>
        <path d="M116 76 C126 66 132 52 130 40" className={s.in} />
        <circle cx="130" cy="36" r="5.6" className={s.i} />
      </g>
      <circle cx="100" cy="55" r="12.5" className={s.i} />
      <rect x="88" y="49" width="24" height="7" rx="3.5" className={s.ink} />
      <circle cx="95" cy="52.5" r="1.4" className={s.white} />
      <circle cx="105" cy="52.5" r="1.4" className={s.white} />
    </svg>
  );
}

function Retro() {
  const snake = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 320 150" className={s.art} aria-hidden="true">
      <g className={s.antenna}>
        <path d="M91 30 L64 6 M91 30 L120 4" className={s.in} />
        <circle cx="64" cy="6" r="3" className={s.i} />
        <circle cx="120" cy="4" r="3" className={s.i} />
      </g>
      <rect x="16" y="30" width="150" height="108" rx="14" className={s.i} />
      <rect x="30" y="44" width="100" height="80" rx="11" className={s.ink} />
      <rect x="66" y="80" width="5" height="5" className={s.food} />
      {snake.map((n) => <rect key={n} x="40" y="54" width="7" height="7" className={s.snake} style={{ animationDelay: `${-n * 0.16}s`, opacity: 1 - n * 0.18 }} />)}
      <circle cx="148" cy="62" r="7" className={s.i} />
      <path d="M148 57 v5" className={s.in} />
      <circle cx="148" cy="88" r="7" className={s.i} />
      <path d="M140 108 h16 M140 114 h16 M140 120 h16" className={s.in} />
      <path d="M36 138 v6 M146 138 v6" className={s.in} />
      <path d="M196 120 C184 120 182 132 166 130" className={s.in} />
      <g className={s.cart}>
        <rect x="222" y="44" width="52" height="46" rx="3" className={s.amber} />
        <rect x="231" y="52" width="34" height="20" rx="2" className={s.i} />
        <path d="M231 80 h34" className={s.in} />
      </g>
      <rect x="196" y="90" width="104" height="42" rx="7" className={s.i} />
      <rect x="216" y="88" width="64" height="7" rx="2" className={s.ink} />
      <circle cx="286" cy="110" r="3.2" className={s.led} />
      <path d="M208 120 h20" className={s.in} />
    </svg>
  );
}

function Speaker() {
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <g className={s.waves}>
        <path d="M52 72 q-12 22 0 44" /><path d="M40 62 q-18 32 0 64" />
        <path d="M148 72 q12 22 0 44" /><path d="M160 62 q18 32 0 64" />
      </g>
      <rect x="62" y="24" width="76" height="110" rx="18" className={s.i} />
      <g className={s.cone}>
        <circle cx="100" cy="94" r="25" className={s.i} />
        <circle cx="100" cy="94" r="15" className={s.i} />
        <circle cx="100" cy="94" r="5" className={s.blue} />
      </g>
      <g className={s.tweet}>
        <circle cx="100" cy="48" r="9" className={s.i} />
        <circle cx="100" cy="48" r="3.5" className={s.ink} />
      </g>
      <g className={s.note}>
        <path d="M156 40 v-18 l12 -4 v18" className={s.in} />
        <ellipse cx="153" cy="40" rx="4" ry="3" className={s.ink} />
        <ellipse cx="165" cy="36" rx="4" ry="3" className={s.ink} />
      </g>
    </svg>
  );
}

function Phone() {
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <path d="M100 134 C100 146 130 140 160 146" className={`${s.in} ${s.cable}`} />
      <rect x="72" y="10" width="56" height="116" rx="11" className={s.i} />
      <rect x="78" y="20" width="44" height="94" rx="5" className={s.soft} />
      <rect x="92" y="14" width="16" height="3" rx="1.5" className={s.ink} />
      <rect x="88" y="48" width="24" height="44" rx="4" className={s.i} />
      <rect x="95" y="44" width="10" height="4" rx="1" className={s.ink} />
      <rect x="91" y="51" width="18" height="38" rx="2" className={s.charge} />
      <path d="M102 58 l-7 13 h6 l-3 11 9 -15 h-6 l3 -9z" className={s.bolt} />
      <rect x="94" y="126" width="12" height="9" rx="2" className={s.ink} />
    </svg>
  );
}

function Laptop() {
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <g className={s.lid}>
        <rect x="44" y="34" width="112" height="84" rx="7" className={s.i} />
        <rect x="52" y="42" width="96" height="68" rx="2" className={s.ink} />
        {[[60, 54, 38, 0], [68, 64, 52, 1], [68, 74, 30, 2], [60, 84, 44, 3], [60, 94, 22, 4]].map(([x, y, w, n]) => (
          <rect key={n} x={x} y={y} width={w} height="4" rx="2" className={s.code} style={{ animationDelay: `${n * 0.45}s` }} />
        ))}
        <rect x="86" y="93" width="2.5" height="6" className={s.caret} />
      </g>
      <path d="M30 118 L170 118 L184 132 L16 132 Z" className={s.i} />
      <path d="M86 125 h28" className={s.in} />
    </svg>
  );
}

function Router() {
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <g className={s.wifi}>
        <path d="M86 30 a20 20 0 0 1 28 0" /><path d="M78 22 a32 32 0 0 1 44 0" /><path d="M70 14 a44 44 0 0 1 60 0" />
      </g>
      <rect x="52" y="42" width="7" height="50" rx="3.5" transform="rotate(-14 55 92)" className={s.i} />
      <rect x="96.5" y="36" width="7" height="56" rx="3.5" className={s.i} />
      <rect x="141" y="42" width="7" height="50" rx="3.5" transform="rotate(14 145 92)" className={s.i} />
      <rect x="36" y="88" width="128" height="34" rx="9" className={s.i} />
      {[0, 1, 2, 3].map((n) => <circle key={n} cx={56 + n * 13} cy="105" r="3" className={s.blink} style={{ animationDelay: `${n * 0.27}s` }} />)}
      <path d="M124 100 h24 M124 110 h24" className={s.in} />
      <path d="M48 122 v6 M152 122 v6" className={s.in} />
    </svg>
  );
}

function Car() {
  const wheel = (cx) => (
    <g key={cx}>
      <circle cx={cx} cy="108" r="17" className={s.ink} />
      <circle cx={cx} cy="108" r="8.5" className={s.i} />
      <g className={s.spin} style={{ transformOrigin: `${cx}px 108px` }}><path d={`M${cx - 8} 108 h16 M${cx} 100 v16`} className={s.in} /></g>
    </g>
  );
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <path d="M0 127.5 H200" className={s.road} />
      <path d="M0 136 H200" className={s.dash} />
      <g className={s.speed}><path d="M6 76 h18 M2 90 h14 M10 62 h10" /></g>
      <g className={s.bounce}>
        <g className={s.whip}><path d="M140 62 L158 22" className={s.in} /><circle cx="158" cy="21" r="2.5" className={s.coral} /></g>
        <path d="M36 80 L28 64 L50 64 L48 78" className={s.i} />
        <path d="M30 100 L44 78 L92 74 L110 58 L150 60 L172 82 L178 100 Z" className={s.blueFill} />
        <path d="M112 64 L146 65 L160 80 L108 78 Z" className={s.soft} />
        <path d="M44 88 H170" className={s.in} />
      </g>
      {wheel(58)}
      {wheel(150)}
    </svg>
  );
}

function Watch() {
  return (
    <svg viewBox="0 0 200 150" className={s.art} aria-hidden="true">
      <path d="M78 0 h44 v30 h-44z M78 120 h44 v30 h-44z" className={s.i} />
      <circle cx="100" cy="134" r="2" className={s.ink} />
      <circle cx="100" cy="142" r="2" className={s.ink} />
      <rect x="138" y="62" width="7" height="16" rx="2.5" className={s.i} />
      <rect x="60" y="26" width="80" height="98" rx="22" className={s.i} />
      <rect x="68" y="34" width="64" height="82" rx="15" className={s.ink} />
      <text x="100" y="62" textAnchor="middle" className={s.time}>10:42</text>
      <path d="M72 90 H86 L90 80 L96 104 L101 72 L106 96 L110 90 H128" className={s.ecg} pathLength="1" />
      <text x="100" y="111" textAnchor="middle" className={s.bpm}>72 BPM</text>
    </svg>
  );
}

export const WORLD_ART = { figure: Figure, retro: Retro, speaker: Speaker, phone: Phone, laptop: Laptop, router: Router, car: Car, watch: Watch };
