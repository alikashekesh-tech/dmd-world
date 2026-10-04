import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './useInView.js';

const easeOut = (t) => 1 - (1 - t) ** 3;

/** Animates a number from `from` to `to` once `run` turns true. Lands on `to` immediately when motion is reduced. */
export default function useTween(from, to, run, { duration = 1100, delay = 0 } = {}) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!run) return undefined;
    if (prefersReducedMotion()) { setV(to); return undefined; }
    let raf; let start;
    const t0 = setTimeout(() => {
      const step = (now) => {
        start ??= now;
        const k = Math.min(1, (now - start) / duration);
        setV(from + (to - from) * easeOut(k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    // Browsers pause animation frames in background tabs: always land on the real value anyway (prices!).
    const t1 = setTimeout(() => { cancelAnimationFrame(raf); setV(to); }, delay + duration + 250);
    return () => { clearTimeout(t0); clearTimeout(t1); cancelAnimationFrame(raf); };
  }, [from, to, run, duration, delay]);
  return v;
}
