import { useEffect, useState } from 'react';

/* Hash routing (#/orders/123?x=1): works on any host without server rewrites and keeps the admin fully separate
   from the storefront's router. */
const read = () => {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
};

export function useRoute() {
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const navigate = (to) => { location.hash = to.startsWith('#') ? to : `#${to}`; };
export const setQuery = (patch) => {
  const { path, query } = read();
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') query.delete(k); else query.set(k, String(v)); }
  const qs = query.toString();
  history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

export function match(pattern, path) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  const m = path.match(re);
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null;
}

export function Link({ to, children, className, onClick, ...rest }) {
  return <a href={to.startsWith('#') ? to : `#${to}`} className={className} onClick={onClick} {...rest}>{children}</a>;
}
