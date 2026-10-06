import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { OFFERS_URL, useLanding, usd } from './data.js';
import MiniCard from './MiniCard.jsx';
import useInView from './useInView.js';
import useTween from './useTween.js';
import s from './PriceDrop.module.css';

/* Rule of 100: under $100 a percentage reads bigger, above it the dollar amount does. */
const badgeFor = (p) => (p.price < 100 ? `−${p.discount}%` : `Save ${usd(p.was - p.price)}`);

function Ticker({ p, run, i }) {
  const v = useTween(p.was, p.price, run, { delay: 300 + i * 90, duration: 1300 });
  const done = Math.abs(v - p.price) < 0.01;
  return (
    <>
      <b className={done ? s.landed : undefined}>{done ? usd(p.price) : `$${Math.ceil(v)}`}</b>
      <del>{usd(p.was)}</del>
    </>
  );
}

export default function PriceDrop({ n = 2 }) {
  const { OFFERS, OFFER_COUNT } = useLanding();
  const [ref, { seen }] = useInView({ threshold: 0.2 });
  if (!OFFERS.length) return null;
  const deepest = OFFERS[0].discount;
  return (
    <section id="offers" ref={ref} className={s.sec} data-seen={seen || undefined} aria-labelledby="pd-title">
      <div className="container">
        <div className={s.head}>
          <div>
            <p className={s.eyebrow}>{String(n).padStart(2, '0')} · Price drops</p>
            <h2 id="pd-title" className={s.title}>Prices that just <span>dropped.</span></h2>
            <p className={s.sub}>Real reductions on things in stock, biggest first. The crossed-out number is what it cost before.</p>
          </div>
          <svg className={s.chart} viewBox="0 0 240 110" aria-hidden="true">
            {Array.from({ length: 5 }, (_, r) => Array.from({ length: 9 }, (_, c) => <circle key={`${r}-${c}`} cx={12 + c * 27} cy={14 + r * 20} r="1.1" className={s.grid} />))}
            <path d="M8 30 L44 32 L76 26 L108 34 L138 30" pathLength="1" className={s.lineA} />
            <path d="M138 30 L160 82 L196 86 L228 84" pathLength="1" className={s.lineB} />
            <circle cx="228" cy="84" r="5" className={s.ping} />
            <circle cx="228" cy="84" r="4" className={s.end} />
            <text x="168" y="50" className={s.drop}>−{deepest}%</text>
          </svg>
        </div>

        <div className={s.grid4}>
          {OFFERS.map((p, i) => (
            <MiniCard key={p.id} product={p} badge={badgeFor(p)} price={<Ticker p={p} run={seen} i={i} />} style={{ '--i': i }} />
          ))}
        </div>

        <div className={s.more}>
          <Link to={OFFERS_URL} className={s.moreLink}>See all {OFFER_COUNT} offers <ArrowRight size={17} /></Link>
        </div>
      </div>
    </section>
  );
}
