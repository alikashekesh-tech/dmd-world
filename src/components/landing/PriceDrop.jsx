import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { OFFERS_URL, useLanding, usd } from './data.js';
import MiniCard from './MiniCard.jsx';
import useInView from './useInView.js';
import s from './PriceDrop.module.css';

/* Rule of 100: under $100 a percentage reads bigger, above it the dollar amount does. */
const badgeFor = (p) => (p.price < 100 ? `−${p.discount}%` : `Save ${usd(p.was - p.price)}`);

/* Only whole rows: how many offers each layout shows (4 columns on desktop, 3 on tablets, 2 on phones). Prices are
   shown as they are from the first frame; the one moment of motion is "dropped." settling into place. */
const rows = (n, cols, max) => (n <= cols ? n : Math.min(max, n - (n % cols)));

export default function PriceDrop() {
  const { OFFERS, OFFER_COUNT } = useLanding();
  const [ref, { seen }] = useInView({ threshold: 0.2 });
  if (!OFFERS.length) return null;
  const n = OFFERS.length;
  const lg = rows(n, 4, 8), md = rows(n, 3, 6), sm = rows(n, 2, 6);
  const hide = (i) => [i >= lg && s.hideLg, i >= md && s.hideMd, i >= sm && s.hideSm].filter(Boolean).join(' ');
  return (
    <section id="offers" ref={ref} className={s.sec} data-seen={seen || undefined} aria-labelledby="pd-title">
      <div className="container">
        <div className={s.head}>
          <div>
            <p className={s.eyebrow}>02 · Price drops</p>
            <h2 id="pd-title" className={s.title}>Prices that just <span>dropped.</span></h2>
            <p className={s.sub}>Real reductions on things in stock, biggest first. The crossed-out number is what it cost before.</p>
          </div>
          <Link to={OFFERS_URL} className={s.headLink}>See all {OFFER_COUNT} offers <ArrowRight size={16} /></Link>
        </div>

        <div className={s.grid}>
          {OFFERS.slice(0, Math.max(lg, md, sm)).map((p, i) => (
            <MiniCard key={p.id} product={p} badge={badgeFor(p)} className={hide(i)} />
          ))}
        </div>

        <Link to={OFFERS_URL} className={s.moreLink}>See all {OFFER_COUNT} offers <ArrowRight size={17} /></Link>
      </div>
    </section>
  );
}
