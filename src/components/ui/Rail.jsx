import { Children, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from '../common/icons.jsx';
import s from './Rail.module.css';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* A horizontal product rail: native scrolling (touch, trackpad, shift+wheel) with scroll snap, previous/next buttons
   that move one full view of cards, and a thin track that mirrors the scroll position in place of the scrollbar.
   Whole cards per view on wide screens (no half-cut card), a peek of the next card on phones so it reads as swipeable.
   Controls and track hide when everything fits. `title` and `aside` fill the header row; the buttons sit after `aside`. */
export default function Rail({ label, title, aside, children, className = '' }) {
  const id = useId();
  const track = useRef(null);
  const thumb = useRef(null);
  const [st, setSt] = useState({ fits: true, prev: false, next: false });
  const count = Children.count(children);

  /* The indicator follows the scroll 1:1 through CSS variables written straight onto the thumb; React state only
     changes when the controls' enabled/hidden state does. */
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    thumb.current?.style.setProperty('--size', Math.min(1, clientWidth / scrollWidth));
    thumb.current?.style.setProperty('--pos', scrollLeft / scrollWidth);
    const next = { fits: scrollWidth <= clientWidth + 1, prev: scrollLeft > 1, next: scrollLeft + clientWidth < scrollWidth - 1 };
    setSt((cur) => (cur.fits === next.fits && cur.prev === next.prev && cur.next === next.next ? cur : next));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    measure();
    return () => { el.removeEventListener('scroll', onScroll); ro?.disconnect(); cancelAnimationFrame(raf); };
  }, [measure, count]);

  const go = (dir) => {
    const el = track.current;
    if (!el || (dir < 0 ? !st.prev : !st.next)) return;
    const card = el.firstElementChild;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const stepW = card ? card.getBoundingClientRect().width + gap : el.clientWidth;
    const perView = Math.max(1, Math.floor((el.clientWidth + gap + 1) / stepW));
    el.scrollBy({ left: dir * perView * stepW, behavior: reduced() ? 'auto' : 'smooth' });
  };

  return (
    <div className={`${s.rail} ${className}`} data-fits={st.fits || undefined}>
      <div className={s.head}>
        <div className={s.title}>{title}</div>
        <div className={s.tools}>
          {aside}
          <div className={s.ctrls}>
            <button type="button" className={s.btn} aria-controls={id} aria-disabled={!st.prev} aria-label={`Previous: ${label}`} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
            <button type="button" className={s.btn} aria-controls={id} aria-disabled={!st.next} aria-label={`Next: ${label}`} onClick={() => go(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      {/* focusable so the arrow keys scroll it, like any scroll area */}
      <div ref={track} id={id} className={s.track} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <div className={s.progress} aria-hidden="true"><i ref={thumb} /></div>
    </div>
  );
}
