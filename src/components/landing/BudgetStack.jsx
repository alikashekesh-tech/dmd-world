import { useMemo, useRef, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { BUDGET_STOPS, useLanding, usd } from './data.js';
import MiniCard from './MiniCard.jsx';
import useInView from './useInView.js';
import s from './BudgetStack.module.css';

/* Start from the visitor's number instead of the catalog's. Each stop adds a coin to the stack. */
const START = BUDGET_STOPS.indexOf(40);

function Coins({ n }) {
  const first = useRef(n); // coins present on first paint drop in sequence; later ones drop alone
  const RX = 40; const RY = 11; const H = 9; const BASE = 232;
  return (
    <svg className={s.coins} viewBox="0 100 120 160" aria-hidden="true">
      <ellipse cx="60" cy={BASE + 12} rx="52" ry="9" className={s.coinShadow} />
      {Array.from({ length: n }, (_, i) => {
        const y = BASE - i * H;
        const x1 = 60 - RX; const x2 = 60 + RX;
        const wobble = ((i * 37) % 7) - 3;
        return (
          <g key={i} className={s.coin} style={{ '--x': `${wobble}px`, '--n': i < first.current ? i : 0 }}>
            <path d={`M${x1} ${y - H} L${x1} ${y} A${RX} ${RY} 0 0 0 ${x2} ${y} L${x2} ${y - H} Z`} className={s.side} />
            <path d={`M${x1 + 10} ${y + 6} v-${H - 2} M${x1 + 22} ${y + 9} v-${H - 2} M${x1 + 36} ${y + 10.5} v-${H - 2} M${x1 + 50} ${y + 10.5} v-${H - 2} M${x1 + 64} ${y + 9} v-${H - 2} M${x1 + 76} ${y + 5} v-${H - 2}`} className={s.ridge} />
            <ellipse cx="60" cy={y - H} rx={RX} ry={RY} className={s.face} />
            <ellipse cx="60" cy={y - H} rx={RX - 9} ry={RY - 3} className={s.ring} />
          </g>
        );
      })}
    </svg>
  );
}

export default function BudgetStack() {
  const [i, setI] = useState(START);
  const [ref, { seen }] = useInView({ threshold: 0.2 });
  const max = BUDGET_STOPS[i];
  const { underBudget } = useLanding();
  const { count, picks } = useMemo(() => underBudget(max), [max, underBudget]);
  const pct = (i / (BUDGET_STOPS.length - 1)) * 100;

  return (
    <section ref={ref} className={s.sec} data-seen={seen || undefined} aria-labelledby="bs-title">
      <div className="container">
        <div className={s.head}>
          <p className={s.eyebrow}>03 · Your budget</p>
          <h2 id="bs-title" className={s.title}>How much do you want to spend?</h2>
          <p className={s.sub}>Slide to your number. We’ll show the most you can get for it.</p>
        </div>

        <div className={s.panel}>
          <div className={s.controls}>
            <div className={s.readout}>
              <Coins n={i + 1} />
              <div>
                <p className={s.amount} aria-live="polite"><span>up to</span>{usd(max)}</p>
                <p className={s.result}><b>{count}</b> products in stock at {usd(max)} or less</p>
              </div>
            </div>

            <label className={s.sliderLabel} htmlFor="bs-range">Budget</label>
            <input
              id="bs-range"
              className={s.range}
              type="range"
              min="0"
              max={BUDGET_STOPS.length - 1}
              step="1"
              value={i}
              onChange={(e) => setI(Number(e.target.value))}
              aria-valuetext={`Up to ${usd(max)}`}
              style={{ '--p': `${pct}%` }}
            />
            <div className={s.ticks} aria-hidden="true">
              {BUDGET_STOPS.map((v, k) => <button type="button" tabIndex={-1} key={v} className={k === i ? s.tickOn : undefined} onClick={() => setI(k)} style={{ left: `${(k / (BUDGET_STOPS.length - 1)) * 100}%` }}>{[0, 3, 7, 9, 11].includes(k) ? `$${v}` : ''}</button>)}
            </div>

            <Link to={`/shop?price=0-${max}`} className={s.cta}>See all {count} <ArrowRight size={17} /></Link>
          </div>

          <div className={s.picks} key={max}>
            {picks.map((p, k) => <MiniCard key={p.id} product={p} compact style={{ '--i': k }} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
