/**
 * Minimal client-side router (History API). Zero dependencies.
 * API mirrors react-router v6 closely enough to be swapped for it later:
 *   <Router>, <Routes routes=[{path, element}]>, <Link>, <NavLink>,
 *   useNavigate(), useParams(), useLocation(), useSearchParams()
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterCtx = createContext(null);
const ParamsCtx = createContext({});

const read = () => ({ pathname: window.location.pathname, search: window.location.search });

export function Router({ children }) {
  const [loc, setLoc] = useState(read);

  useEffect(() => {
    const onPop = () => setLoc(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, opts = {}) => {
    if (typeof to === 'number') return window.history.go(to);
    const url = new URL(to, window.location.origin);
    const next = { pathname: url.pathname, search: url.search };
    const same = next.pathname === window.location.pathname && next.search === window.location.search;
    if (opts.replace || same) window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    else window.history.pushState({}, '', url.pathname + url.search + url.hash);
    setLoc(next);
    if (!opts.noScroll && (next.pathname !== loc.pathname)) window.scrollTo({ top: 0, left: 0 });
  }, [loc.pathname]);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export const useLocation = () => {
  const { pathname, search } = useContext(RouterCtx);
  return { pathname, search };
};
export const useNavigate = () => useContext(RouterCtx).navigate;
export const useParams = () => useContext(ParamsCtx);

export function useSearchParams() {
  const { search, pathname, navigate } = useContext(RouterCtx);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const set = useCallback((next, opts = {}) => {
    const p = next instanceof URLSearchParams ? next : new URLSearchParams(next);
    const qs = p.toString();
    navigate(pathname + (qs ? `?${qs}` : ''), { replace: true, noScroll: true, ...opts });
  }, [navigate, pathname]);
  return [params, set];
}

function compile(path) {
  const keys = [];
  let re = path.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  if (re.endsWith('/*')) { re = re.slice(0, -2) + '(?:/(.*))?'; keys.push('*'); }
  return { re: new RegExp(`^${re}/?$`), keys };
}

export function Routes({ routes, fallback }) {
  const { pathname } = useContext(RouterCtx);
  const compiled = useMemo(() => routes.map((r) => ({ ...r, ...compile(r.path) })), [routes]);
  for (const r of compiled) {
    const m = pathname.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1] == null ? '' : decodeURIComponent(m[i + 1]); });
      return <ParamsCtx.Provider value={params}>{r.element}</ParamsCtx.Provider>;
    }
  }
  return fallback ?? null;
}

const isModified = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

export function Link({ to, onClick, replace, children, ...rest }) {
  const navigate = useNavigate();
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || isModified(e) || rest.target === '_blank') return;
    if (/^https?:|^mailto:/.test(to)) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

export function NavLink({ to, className, activeClassName = 'active', end, children, ...rest }) {
  const { pathname } = useLocation();
  const base = to.split('?')[0];
  const active = end ? pathname === base : pathname === base || pathname.startsWith(base + '/');
  const cls = [typeof className === 'function' ? className({ isActive: active }) : className, active ? activeClassName : '']
    .filter(Boolean).join(' ');
  return <Link to={to} className={cls} aria-current={active ? 'page' : undefined} {...rest}>{children}</Link>;
}
