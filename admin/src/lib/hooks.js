import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** GET a server path; re-fetches when `path` changes or anything in the store changes (adm:changed). */
export function useApi(path, { live = true, keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const ctrl = useRef(null);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!quiet) setState((s) => ({ data: keepPrevious ? s.data : null, error: null, loading: true }));
    try {
      const data = await api.get(path, { signal: c.signal });
      if (!c.signal.aborted) setState({ data, error: null, loading: false });
    } catch (e) {
      if (e.name !== 'AbortError') setState((s) => ({ data: s.data, error: e, loading: false }));
    }
  }, [path, keepPrevious]);
  useEffect(() => { load(); return () => ctrl.current?.abort(); }, [load]);
  useEffect(() => {
    if (!live) return undefined;
    const on = () => load(true);
    window.addEventListener('adm:changed', on);
    return () => window.removeEventListener('adm:changed', on);
  }, [load, live]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload: load, setData };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Animated number (eases to the target). Respects reduced motion. */
export function useCount(target, ms = 900) {
  const [v, setV] = useState(target ?? 0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return undefined; }
    const start = performance.now(); const a = from.current; let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms); const e = 1 - (1 - k) ** 3;
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function useHotkey(test, fn) {
  useEffect(() => {
    const on = (e) => { if (test(e)) { e.preventDefault(); fn(e); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [test, fn]);
}
