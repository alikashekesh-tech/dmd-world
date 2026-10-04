import { useMemo } from 'react';
import { useSearchParams } from '../../router/index.jsx';

const RESERVED = ['sort', 'price', 'rating', 'q', 'stock', 'page'];

/** URL <-> filter state. Every facet key is a comma-separated list in the query string. */
export default function useFilters(keys) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => {
    const f = {};
    for (const k of keys) { const v = params.get(k); if (v) f[k] = v.split(','); }
    const pr = params.get('price');
    if (pr) { const [a, b] = pr.split('-').map(Number); if (!Number.isNaN(a)) f.price = [a, Number.isNaN(b) ? Infinity : b]; }
    if (params.get('rating')) f.rating = Number(params.get('rating'));
    if (params.get('stock')) f.stock = ['in'];
    if (params.get('q')) f.q = params.get('q');
    return f;
  }, [params, keys]);
  const sort = params.get('sort') || 'featured';

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || (Array.isArray(v) && v.length === 0) || v === '' || v === 0) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    next.delete('page');
    setParams(next);
  };
  const toggle = (key, value) => {
    const cur = state[key] || [];
    update({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  };
  const clearAll = () => {
    const next = new URLSearchParams();
    if (params.get('sort')) next.set('sort', params.get('sort'));
    setParams(next);
  };
  const activeCount = Object.keys(state).filter((k) => k !== 'q').length;
  return { state, sort, update, toggle, clearAll, activeCount, params, setParams, RESERVED };
}
