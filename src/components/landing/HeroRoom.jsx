import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '../../router/index.jsx';
import { groupBySlug, BRAND_GROUPS } from '../../data/dmdMenu.js';
import { PRODUCTS } from '../../data/index.js';
import { useLanding, usd } from './data.js';
import useInView, { prefersReducedMotion } from './useInView.js';
import useTween from './useTween.js';
import s from './HeroRoom.module.css';

/* The hero is one drawing: a desk at night, seen from behind the chair. It draws itself, the monitor boots,
   and every object on it is a link to the part of the shop that sells it. Coordinates are in a 960×640 viewBox. */

const VB_TOP = 34; // the top of the wall is empty, so the visible window starts a little lower
const VB_H = 640 - VB_TOP;
const D = { pathLength: 1, className: s.d };
const DN = { pathLength: 1, className: s.dn };
const PINS = { shelf: [238, 128], chair: [118, 300], headset: [290, 268], controller: [375, 434], monitor: [742, 156], keyboard: [554, 424], mouse: [746, 431], console: [868, 238] };

/* Flat objects are drawn top-down and squashed onto the desk plane. */
const flat = (d, ox, oy, sx, sy) => d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, x, y) => `${+(ox + x * sx).toFixed(1)} ${+(oy + y * sy).toFixed(1)}`);
const fp = (x, y) => [324 + x * 0.85, 432 + y * 0.32];
const PAD = flat('M22 8 C38 2 82 2 98 8 C110 13 118 34 118 56 C118 70 108 78 98 70 C90 63 84 54 60 54 C36 54 30 63 22 70 C12 78 2 70 2 56 C2 34 10 13 22 8 Z', 324, 432, 0.85, 0.32);
const TOUCH = flat('M44 8 L76 8 L74 30 L46 30 Z', 324, 432, 0.85, 0.32);

/* Tenkeyless board: 5 rows of 16 units, wave delay follows the x position. */
const ROWS = [Array(16).fill(1), [1.5, ...Array(13).fill(1), 1.5], [1.8, ...Array(12).fill(1), 2.2], [2.3, ...Array(11).fill(1), 2.7], [1.3, 1.3, 1.3, 6.9, 1.3, 1.3, 1.3, 1.3]];
const KB = { x: 440, y: 424, w: 228, h: 32, pad: 3, gap: 1.3 };
const KEYS = (() => {
  const inner = KB.w - KB.pad * 2;
  const rh = (KB.h - KB.pad * 2 - KB.gap * 4) / 5;
  const out = [];
  ROWS.forEach((row, r) => {
    const u = (inner - KB.gap * (row.length - 1)) / 16;
    let x = KB.x + KB.pad;
    row.forEach((w, c) => {
      const kw = w * u;
      out.push({ k: `${r}-${c}`, x: +x.toFixed(2), y: +(KB.y + KB.pad + r * (rh + KB.gap)).toFixed(2), w: +kw.toFixed(2), h: +rh.toFixed(2), d: -(((x - KB.x) / KB.w) * 2.4 + r * 0.12) });
      x += kw + KB.gap;
    });
  });
  return out;
})();

const sprite = (rows, ox, oy, b, map) => rows.flatMap((row, y) => [...row].map((ch, x) => (map[ch] ? <rect key={`${x}-${y}`} x={ox + x * b} y={oy + y * b} width={b + 0.05} height={b + 0.05} fill={map[ch]} /> : null)));
const HERO = ['..XXXX..', '.XXXXXX.', 'XXVVVVXX', 'XXVVVVXX', '.XXXXXX.', 'XXXXXXXX', 'X.XXXX.X', '..XXXX..'];
const LEGS_A = ['.XX..XX.', '.X....X.'];
const LEGS_B = ['..XXXX..', '..X..X..'];
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const PX = { X: '#ff8a5c', V: '#fff1e6' };

const FAR = 'M0 318 L0 262 L40 236 L78 258 L120 214 L168 250 L206 228 L250 262 L290 226 L330 246 L356 262 L356 318 Z';
const NEAR = 'M0 318 L0 292 L30 282 L60 292 L100 270 L140 288 L180 276 L220 294 L260 272 L300 284 L330 278 L356 292 L356 318 Z';

export default function HeroRoom() {
  const { HOTSPOTS } = useLanding();
  const BY_ID = useMemo(() => Object.fromEntries(HOTSPOTS.map((h) => [h.id, h])), [HOTSPOTS]);
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [ref, { seen, live }] = useInView({ threshold: 0 });
  const stage = useRef(null);
  const raf = useRef(0);

  const onMove = useCallback((e) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion() || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      stage.current?.style.setProperty('--px', x.toFixed(3));
      stage.current?.style.setProperty('--py', y.toFixed(3));
    });
  }, []);
  const onLeave = () => {
    cancelAnimationFrame(raf.current);
    stage.current?.style.setProperty('--px', '0');
    stage.current?.style.setProperty('--py', '0');
    setActive(null);
  };

  const spot = (id) => {
    const h = BY_ID[id];
    return {
      href: h.to,
      className: s.obj,
      'data-active': active === id || undefined,
      'aria-label': h.from ? `${h.label}, from ${usd(h.from)}` : h.label,
      onMouseEnter: () => setActive(id),
      onMouseLeave: () => setActive(null),
      onFocus: () => setActive(id),
      onBlur: () => setActive(null),
      onClick: (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(h.to);
      },
    };
  };

  const ps = useTween(0, groupBySlug.playstation.count, seen, { delay: 900, duration: 1400 });
  const sw = useTween(0, groupBySlug['nintendo-switch'].count, seen, { delay: 1000, duration: 1400 });
  const br = useTween(0, BRAND_GROUPS.length, seen, { delay: 1100, duration: 1400 });

  const tip = active && BY_ID[active];
  const [tx, ty] = active ? PINS[active] : [0, 0];
  const edge = tx < 180 ? s.tipL : tx > 800 ? s.tipR : '';

  return (
    <section ref={ref} className={s.hero} data-paused={!live || undefined} aria-labelledby="hero-title">
      <div className={`container ${s.in}`}>
        <div className={s.copy}>
          <p className={s.kicker}>Player 1 ready</p>
          <h1 id="hero-title" className={s.title}>
            Every setup starts{' '}
            <em>
              somewhere.
              <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true"><path d="M4 16 C60 6 120 6 170 12 S260 20 296 8" pathLength="1" /></svg>
            </em>
          </h1>
          <p className={s.lead}>
            Consoles, games, chairs, headsets and the small things in between, from PlayStation, Nintendo, Xbox,
            Razer, HyperX, Logitech and more. {PRODUCTS.length.toLocaleString('en-US')} products in one place.
          </p>
          <div className={s.ctas}>
            <a href="#platform" className={s.primary}>
              Pick your platform
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </a>
            <Link to="/shop" className={s.secondary}>or browse everything</Link>
          </div>
          <dl className={s.facts}>
            <div><dt>PlayStation products</dt><dd>{Math.round(ps)}</dd></div>
            <div><dt>For Nintendo Switch</dt><dd>{Math.round(sw)}</dd></div>
            <div><dt>Gear brands</dt><dd>{Math.round(br)}</dd></div>
          </dl>
        </div>

        <div className={s.stageWrap}>
          <div ref={stage} className={s.stage} onPointerMove={onMove} onPointerLeave={onLeave}>
            <svg className={s.scene} viewBox={`0 ${VB_TOP} 960 ${VB_H}`} data-focus={active ? '' : undefined} role="group" aria-label="A gaming desk at night. Each item on it links to where it is sold in the shop.">
              <defs>
                <radialGradient id="h-glow"><stop offset="0" stopColor="#4f8dff" stopOpacity=".42" /><stop offset=".55" stopColor="#2f5fd0" stopOpacity=".1" /><stop offset="1" stopColor="#2f5fd0" stopOpacity="0" /></radialGradient>
                <radialGradient id="h-floor"><stop offset="0" stopColor="#4f8dff" stopOpacity=".5" /><stop offset="1" stopColor="#4f8dff" stopOpacity="0" /></radialGradient>
                <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1330" /><stop offset="1" stopColor="#25427f" /></linearGradient>
                <linearGradient id="h-glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".09" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
                <clipPath id="h-screen"><rect x="382" y="160" width="356" height="196" rx="3" /></clipPath>
                <pattern id="h-scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".28" /></pattern>
              </defs>

              {/* Wall: glow, a slowly turning wireframe world, a shelf and a poster */}
              <g className={s.back}>
                <ellipse cx="560" cy="250" rx="430" ry="300" fill="url(#h-glow)" className={s.wallGlow} />
                <g className={s.globe}>
                  <circle cx="560" cy="255" r="205" />
                  {[-150, -100, -50, 0, 50, 100, 150].map((dy) => { const rx = Math.sqrt(205 ** 2 - dy ** 2); return <ellipse key={dy} cx="560" cy={255 + dy} rx={rx} ry={rx * 0.09} />; })}
                  {[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx="560" cy="255" rx="205" ry="205" className={s.mer} style={{ animationDelay: `${-i * 2}s` }} />)}
                </g>

                <g style={{ '--d': '.5s' }}>
                  <rect x="772" y="92" width="110" height="124" rx="4" {...D} />
                  <rect x="781" y="101" width="92" height="106" rx="2" {...DN} />
                  <g className={s.heart}>{sprite(HEART, 806, 120, 6, { X: '#ff7a59' })}</g>
                  <text x="827" y="190" className={s.hud} textAnchor="middle">EXTRA LIFE</text>
                </g>

                <a {...spot('shelf')}>
                  <rect x="146" y="100" width="200" height="125" className={s.hit} />
                  <g style={{ '--d': '.85s' }}>
                    <rect x="148" y="198" width="196" height="7" rx="2" {...D} />
                    <path d="M170 205 L170 222 L186 205" {...DN} />
                    <path d="M322 205 L322 222 L306 205" {...DN} />
                    <line x1="186" y1="118" x2="186" y2="110" {...DN} />
                    <circle cx="186" cy="108" r="2.6" className={s.antenna} />
                    <rect x="174" y="118" width="24" height="20" rx="5" {...D} />
                    <circle cx="181" cy="128" r="2.2" className={s.eye} />
                    <circle cx="191" cy="128" r="2.2" className={s.eye} />
                    <rect x="172" y="141" width="28" height="30" rx="6" {...D} />
                    <rect x="180" y="149" width="12" height="8" rx="2" {...DN} />
                    <path d="M172 146 L163 162" {...DN} />
                    <g className={s.wave}><path d="M200 146 L210 133" {...DN} /><circle cx="211" cy="131" r="2.6" {...D} /></g>
                    <rect x="176" y="172" width="8" height="25" rx="3" {...D} />
                    <rect x="188" y="172" width="8" height="25" rx="3" {...D} />
                    <rect x="222" y="134" width="40" height="64" rx="6" {...D} />
                    <rect x="228" y="140" width="28" height="22" rx="2" className={s.lcd} />
                    <g className={s.lcdPx}><rect x="236" y="150" width="4" height="4" /><rect x="244" y="146" width="4" height="4" /></g>
                    <path d="M232 174 h8 M236 170 v8" {...DN} />
                    <circle cx="250" cy="176" r="2.6" {...D} />
                    <circle cx="256" cy="170" r="2.6" {...D} />
                    <path d="M238 189 h5 M246 189 h5" {...DN} />
                    <rect x="276" y="150" width="14" height="48" rx="2" {...D} />
                    <rect x="292" y="150" width="14" height="48" rx="2" {...D} />
                    <rect x="309" y="156" width="14" height="42" rx="2" transform="rotate(8 316 198)" {...D} />
                  </g>
                </a>
              </g>

              {/* Desk and everything on it */}
              <g className={s.mid}>
                <ellipse cx="540" cy="634" rx="420" ry="20" fill="url(#h-floor)" className={s.floorGlow} />
                <g style={{ '--d': '.1s' }}>
                  <rect x="160" y="476" width="16" height="170" {...D} />
                  <rect x="904" y="476" width="16" height="170" {...D} />
                  <rect x="146" y="412" width="790" height="46" rx="3" {...D} className={`${s.d} ${s.top}`} />
                  <rect x="146" y="458" width="790" height="18" rx="2" {...D} />
                </g>
                <line x1="176" y1="482" x2="904" y2="482" className={s.led} />

                <a {...spot('headset')}>
                  <rect x="226" y="262" width="128" height="178" className={s.hit} />
                  <g style={{ '--d': '.55s' }}>
                    <ellipse cx="290" cy="434" rx="32" ry="6" {...D} />
                    <rect x="287" y="282" width="6" height="152" rx="2" {...D} />
                    <path d="M274 286 C278 278 302 278 306 286" {...DN} />
                    <path d="M240 330 C240 286 264 266 290 266 C316 266 340 286 340 330" {...DN} />
                    <path d="M248 330 C248 294 268 276 290 276 C312 276 332 294 332 330" {...DN} />
                    <rect x="230" y="318" width="22" height="46" rx="10" {...D} />
                    <rect x="328" y="318" width="22" height="46" rx="10" {...D} />
                    <rect x="246" y="323" width="8" height="36" rx="4" {...D} />
                    <rect x="326" y="323" width="8" height="36" rx="4" {...D} />
                    <path d="M236 358 C234 374 248 386 268 384" {...DN} />
                    <circle cx="271" cy="384" r="3.4" {...D} />
                    <line x1="234" y1="328" x2="234" y2="354" className={s.cupLed} />
                    <line x1="346" y1="328" x2="346" y2="354" className={s.cupLed} />
                    <g className={s.sound}><path d="M358 330 q8 11 0 22" /><path d="M364 324 q13 17 0 34" /></g>
                  </g>
                </a>

                <a {...spot('monitor')}>
                  <rect x="368" y="146" width="384" height="292" className={s.hit} />
                  <g style={{ '--d': '.25s' }}>
                    <path d="M508 434 L612 434 L602 424 L518 424 Z" {...D} />
                    <rect x="551" y="360" width="18" height="66" {...D} />
                    <rect x="372" y="150" width="376" height="216" rx="9" {...D} className={`${s.d} ${s.bezel}`} />
                  </g>
                  <g clipPath="url(#h-screen)" className={s.screen}>
                    <rect x="382" y="160" width="356" height="196" fill="url(#h-sky)" />
                    {[[410, 190], [470, 214], [520, 182], [588, 204], [622, 236], [712, 186], [440, 236], [560, 230]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" className={s.star} style={{ animationDelay: `${-i * 0.7}s` }} />)}
                    <circle cx="676" cy="206" r="15" className={s.moon} />
                    <g transform="translate(382 0)"><g className={s.far}><path d={FAR} /><path d={FAR} transform="translate(356 0)" /></g></g>
                    <g transform="translate(382 0)"><g className={s.near}><path d={NEAR} /><path d={NEAR} transform="translate(356 0)" /></g></g>
                    <rect x="382" y="318" width="356" height="38" className={s.ground} />
                    <line x1="382" y1="318.5" x2="738" y2="318.5" className={s.groundTop} />
                    <line x1="382" y1="331" x2="738" y2="331" className={s.tiles} />
                    <line x1="382" y1="345" x2="738" y2="345" className={s.tiles2} />
                    <g className={s.crate}>
                      <rect x="740" y="304" width="14" height="14" className={s.box} />
                      <path d="M740 304 L754 318 M754 304 L740 318" className={s.boxX} />
                      <circle cx="747" cy="284" r="4" className={s.coin} />
                    </g>
                    <g className={s.player}>
                      {sprite(HERO, 446, 294, 2.4, PX)}
                      <g className={s.legA}>{sprite(LEGS_A, 446, 313.2, 2.4, PX)}</g>
                      <g className={s.legB}>{sprite(LEGS_B, 446, 313.2, 2.4, PX)}</g>
                    </g>
                    <text x="392" y="177" className={s.hudScreen}>1UP</text>
                    <g>{[0, 1, 2].map((i) => <g key={i}>{sprite(HEART, 418 + i * 13, 170, 1.4, { X: '#ff7a59' })}</g>)}</g>
                    <text x="728" y="177" className={s.hudScreen} textAnchor="end">SCORE 001993</text>
                    <rect x="382" y="160" width="356" height="196" fill="url(#h-scan)" />
                    <path d="M382 160 L560 160 L470 356 L382 356 Z" fill="url(#h-glare)" />
                    <rect x="382" y="160" width="356" height="196" className={s.bootOff} />
                    <rect x="382" y="257" width="356" height="2" className={s.bootLine} />
                  </g>
                  <circle cx="738" cy="360" r="1.7" className={s.power} />
                </a>

                <a {...spot('controller')}>
                  <rect x="322" y="430" width="106" height="30" className={s.hit} />
                  <g style={{ '--d': '.65s' }}>
                    <path d={PAD} {...D} />
                    <path d={TOUCH} {...DN} />
                    <line x1={fp(46, 33)[0]} y1={fp(46, 33)[1]} x2={fp(74, 33)[0]} y2={fp(74, 33)[1]} className={s.lightbar} />
                    <ellipse cx={fp(42, 42)[0]} cy={fp(42, 42)[1]} rx="6" ry="2.4" {...D} />
                    <ellipse cx={fp(78, 42)[0]} cy={fp(78, 42)[1]} rx="6" ry="2.4" {...D} />
                    <path d={`M${fp(18, 24).join(' ')} h9 M${fp(23.3, 18).join(' ')} v3.8`} {...DN} />
                    {[[96, 18], [102, 24], [96, 30], [90, 24]].map(([x, y], i) => <ellipse key={i} cx={fp(x, y)[0]} cy={fp(x, y)[1]} rx="2.2" ry="1.1" className={s.btn} style={{ animationDelay: `${2.6 + i * 0.35}s` }} />)}
                  </g>
                </a>

                <a {...spot('keyboard')}>
                  <rect x="436" y="420" width="236" height="40" className={s.hit} />
                  <g style={{ '--d': '.45s' }}>
                    <rect x={KB.x} y={KB.y} width={KB.w} height={KB.h} rx="4" {...D} />
                    <rect x={KB.x} y={KB.y + KB.h - 1} width={KB.w} height="3" rx="1.5" {...D} />
                  </g>
                  <g className={s.keys}>{KEYS.map((k) => <rect key={k.k} x={k.x} y={k.y} width={k.w} height={k.h} rx=".9" style={{ animationDelay: `${k.d}s` }} />)}</g>
                </a>

                <a {...spot('mouse')}>
                  <rect x="684" y="420" width="124" height="40" className={s.hit} />
                  <g style={{ '--d': '.6s' }}>
                    <rect x="686" y="424" width="120" height="32" rx="5" {...D} />
                    <path d="M746 430 C758 430 762 436 762 441 C762 447 756 451 746 451 C736 451 730 447 730 441 C730 436 734 430 746 430 Z" {...D} />
                    <line x1="746" y1="430.5" x2="746" y2="438" {...DN} />
                    <rect x="744.6" y="432" width="2.8" height="4.4" rx="1.2" className={s.wheel} />
                  </g>
                </a>

                <a {...spot('console')}>
                  <rect x="838" y="232" width="60" height="202" className={s.hit} />
                  <g style={{ '--d': '.7s' }}>
                    <ellipse cx="868" cy="429" rx="22" ry="4.5" {...D} />
                    <path d="M860 424 L852 424 C848 360 846 300 842 252 C842 243 848 238 856 240 L860 252 Z" {...D} className={`${s.d} ${s.wing}`} />
                    <path d="M876 424 L884 424 C888 360 890 300 894 252 C894 243 888 238 880 240 L876 252 Z" {...D} className={`${s.d} ${s.wing}`} />
                    <rect x="860" y="250" width="16" height="174" rx="3" {...D} className={`${s.d} ${s.core}`} />
                    <path d="M860.5 254 V420 M875.5 254 V420" className={s.seam} />
                  </g>
                </a>
              </g>

              {/* The chair you are standing behind */}
              <g className={s.front}>
                <a {...spot('chair')}>
                  <rect x="16" y="286" width="204" height="344" className={s.hit} />
                  <g style={{ '--d': '.15s' }}>
                    <path d="M118 586 L44 606 M118 586 L192 606 M118 586 L76 620 M118 586 L160 620 M118 586 L118 614" {...DN} />
                    {[[44, 609], [192, 609], [76, 623], [160, 623], [118, 617]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" {...D} />)}
                    <rect x="112" y="526" width="12" height="62" rx="3" {...D} />
                    <path d="M40 510 C40 500 70 496 118 496 C166 496 196 500 196 510 C196 522 166 528 118 528 C70 528 40 522 40 510 Z" {...D} />
                    <rect x="36" y="470" width="8" height="40" {...D} />
                    <rect x="192" y="470" width="8" height="40" {...D} />
                    <path d="M58 330 C58 300 82 290 118 290 C154 290 178 300 178 330 L184 476 C184 498 164 508 118 508 C72 508 52 498 52 476 Z" {...D} className={`${s.d} ${s.seat}`} />
                    <path d="M78 312 C74 360 74 430 80 494 M158 312 C162 360 162 430 156 494" {...DN} />
                    <rect x="84" y="316" width="16" height="22" rx="7" {...D} className={`${s.d} ${s.slot}`} />
                    <rect x="136" y="316" width="16" height="22" rx="7" {...D} className={`${s.d} ${s.slot}`} />
                    <path d="M112 296 V504 M124 296 V504" className={s.stripe} pathLength="1" />
                    <rect x="20" y="462" width="34" height="9" rx="4" {...D} />
                    <rect x="182" y="462" width="34" height="9" rx="4" {...D} />
                  </g>
                </a>
              </g>

              <g className={s.beacons} aria-hidden="true">
                {HOTSPOTS.map((h, i) => (
                  <g key={h.id} transform={`translate(${PINS[h.id].join(' ')})`}>
                    <g className={s.beacon} data-on={active === h.id || undefined} style={{ '--i': i }}>
                      <circle r="5" className={s.ring} />
                      <circle r="4.5" className={s.dot} />
                    </g>
                  </g>
                ))}
              </g>
            </svg>

            {tip && (
              <div className={`${s.tip} ${edge}`} style={{ left: `${(tx / 960) * 100}%`, top: `${((ty - VB_TOP) / VB_H) * 100}%` }} aria-hidden="true">
                <b>{tip.label}</b>
                <span>{tip.from ? `from ${usd(tip.from)}` : 'See the range'} →</span>
              </div>
            )}
          </div>
          <p className={s.hint} aria-hidden="true"><span className={s.hintMouse}>Everything on that desk is for sale. Point at it.</span><span className={s.hintTouch}>Everything on that desk is for sale.</span></p>

          <ul className={s.chips} aria-label="Shop the desk">
            {HOTSPOTS.map((h) => (
              <li key={h.id}><Link to={h.to}>{h.label}{h.from ? <small>from {usd(h.from)}</small> : null}</Link></li>
            ))}
          </ul>
        </div>
      </div>

      <a href="#platform" className={s.cue} aria-label="Scroll to the platform picker">
        <svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
          <path d="M11 3h8v8h8v8h-8v8h-8v-8H3v-8h8z" className={s.pad} />
          <path d="M11.5 19.5h7v7h-7z" className={s.padDown} />
          <path d="M15 21.5 v3 M13.3 23 l1.7 1.7 1.7-1.7" className={s.padArrow} />
        </svg>
        <span>Scroll</span>
      </a>
    </section>
  );
}
