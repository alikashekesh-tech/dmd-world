import { useEffect, useState } from 'react';
import { Link } from '../router/index.jsx';
import PixelText from '../components/ui/PixelText.jsx';
import { ArrowRight } from '../components/common/icons.jsx';
import { prefersReducedMotion } from '../components/landing/useInView.js';
import { usePageMeta } from '../lib/meta.js';
import s from './NotFound.module.css';

/* A dead link is a lost life, not a dead end: GAME OVER, then the same CONTINUE? the home page ends on. */
export default function NotFound() {
  usePageMeta({ title: 'Page not found', noindex: true });
  const [d, setD] = useState(9);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const t = setInterval(() => setD((x) => (x === 0 ? 9 : x - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className={s.stage} aria-labelledby="nf-title">
      <div className={`container ${s.in}`}>
        <p className={s.hud}>Error 404 · page not found</p>
        <h1 id="nf-title" className={s.word}>
          <span className="sr-only">Game over: this page does not exist.</span>
          <PixelText text="GAME OVER" className={s.px} cellClass={s.on} />
        </h1>
        <p className={s.lead}>This page doesn’t exist, or it moved. Your cart and wishlist are safe.</p>
        <div className={s.continue}>
          <PixelText text="CONTINUE?" className={s.small} cellClass={s.onSmall} />
          <PixelText text={String(d)} grid className={s.digit} cellClass={s.lit} offClass={s.unlit} />
        </div>
        <div className={s.ctas}>
          <Link to="/" className="btn btn--primary btn--lg">Yes, take me home <ArrowRight size={17} /></Link>
          <Link to="/shop" className="btn btn--ghost btn--lg">Browse the shop</Link>
        </div>
      </div>
    </section>
  );
}
