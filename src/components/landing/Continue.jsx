import { useEffect, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { OFFERS_URL, useLanding } from './data.js';
import useInView, { prefersReducedMotion } from './useInView.js';
import PixelText from '../ui/PixelText.jsx';
import s from './Continue.module.css';

/* The ending: brand names roll like arcade credits, then the screen asks the only question that matters. */

export function Credits({ list, reverse }) {
  const row = (copy) => list.map((b) => (
    <li key={`${copy}-${b.name}`}>
      <Link to={b.to} tabIndex={copy ? -1 : undefined}>{b.name}</Link>
      <i aria-hidden="true" />
    </li>
  ));
  return (
    <div className={`${s.row} ${reverse ? s.rev : ''}`}>
      <ul className={s.track}>{row(0)}</ul>
      <ul className={s.track} aria-hidden="true">{row(1)}</ul>
    </div>
  );
}

export default function Continue() {
  const { BRANDS } = useLanding();
  const [ref, { seen, live }] = useInView({ threshold: 0.25 });
  const [d, setD] = useState(9);
  useEffect(() => {
    if (!live || prefersReducedMotion()) return undefined;
    const t = setInterval(() => setD((x) => (x === 0 ? 9 : x - 1)), 1000);
    return () => clearInterval(t);
  }, [live]);
  const half = Math.ceil(BRANDS.length / 2);

  return (
    <section ref={ref} className={s.sec} data-seen={seen || undefined} data-paused={!live || undefined} aria-labelledby="cont-title">
      <p className={s.label}>In this world</p>
      <Credits list={BRANDS.slice(0, half)} />
      <Credits list={BRANDS.slice(half)} reverse />

      <div className={`container ${s.end}`}>
        <h2 id="cont-title" className={s.word}>
          <span className="sr-only">Continue?</span>
          <PixelText text="CONTINUE?" className={s.wordPx} />
          <PixelText text={String(d)} grid className={s.digit} cellClass={s.lit} offClass={s.unlit} />
        </h2>
        <div className={s.ctas}>
          <Link to="/shop" className={s.yes}>Yes, show me everything <ArrowRight size={18} /></Link>
          <Link to={OFFERS_URL} className={s.no}>Just the offers</Link>
        </div>
        <p className={s.coin}>No coin required</p>
      </div>
    </section>
  );
}
