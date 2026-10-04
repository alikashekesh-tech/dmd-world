import { useEffect, useRef, useState } from 'react';

/** `seen` latches true the first time the element enters the viewport; `live` tracks whether it is on screen now
    (used to pause looping CSS animations while they are scrolled away). */
export default function useInView({ threshold = 0.2, rootMargin = '0px' } = {}) {
  const ref = useRef(null);
  const [state, setState] = useState({ seen: false, live: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setState({ seen: true, live: true }); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      setState((s) => (e.isIntersecting ? { seen: true, live: true } : s.live ? { ...s, live: false } : s));
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);
  return [ref, state];
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
