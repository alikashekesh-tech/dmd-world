import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Button } from '../ui/kit.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.jsx';
import { useApi, useDebounced, useHotkey } from '../lib/hooks.js';
import { money } from '../lib/format.js';

export const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard' }] },
  { group: 'Catalog', items: [
    { to: '/products', label: 'Products', icon: 'box' },
    { to: '/categories', label: 'Categories', icon: 'folder' },
    { to: '/brands', label: 'Brands', icon: 'badge' },
    { to: '/inventory', label: 'Inventory', icon: 'layers', badge: (b) => (b.out ? [b.out, 'coral'] : b.low ? [b.low, 'amber'] : null) },
    { to: '/offers', label: 'Offers', icon: 'percent' },
  ] },
  { group: 'Sales', items: [
    { to: '/orders', label: 'Orders', icon: 'receipt', badge: (b) => (b.pending ? [b.pending, 'amber'] : null) },
    { to: '/customers', label: 'Buyers', icon: 'users' },
    { to: '/messages', label: 'Messages', icon: 'chat', badge: (b) => (b.messages ? [b.messages, 'blue'] : null) },
    { to: '/reviews', label: 'Reviews', icon: 'star', badge: (b) => (b.reviews ? [b.reviews, 'amber'] : null) },
  ] },
  { group: 'Site', items: [
    { to: '/homepage', label: 'Homepage', icon: 'home' },
    { to: '/notifications', label: 'Notifications', icon: 'bell', badge: (b) => (b.notifications ? [b.notifications, 'coral'] : null) },
    { to: '/trash', label: 'Trash', icon: 'trash', badge: (b) => (b.trash ? [b.trash, ''] : null) },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ] },
];
const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.label])));

export const QUICK = [
  { label: 'Add product', icon: 'box', to: '/products/new', key: 'P' },
  { label: 'Add category', icon: 'folder', to: '/categories?new=1', key: 'C' },
  { label: 'Add brand', icon: 'badge', to: '/brands?new=1', key: 'B' },
  { label: 'Create offer', icon: 'percent', to: '/offers?new=offer', key: 'O' },
  { label: 'Create coupon', icon: 'sparkle', to: '/offers?tab=coupons&new=coupon' },
  { label: 'Manage homepage', icon: 'home', to: '/homepage', key: 'H' },
];

const active = (path, to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

export default function Shell({ session, path, children, onSignOut }) {
  const [paletteOpen, setPalette] = useState(false);
  const [sideOpen, setSide] = useState(false);
  const [quickOpen, setQuick] = useState(false);
  const badges = useApi('/badges');
  const b = badges.data?.data || {};
  useEffect(() => { const t = setInterval(() => badges.reload(true), 60e3); return () => clearInterval(t); }, [badges.reload]); // eslint-disable-line
  useEffect(() => { setSide(false); setQuick(false); }, [path]);
  useHotkey(useCallback((e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k', []), useCallback(() => setPalette(true), []));
  useHotkey(useCallback((e) => e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName), []), useCallback(() => setPalette(true), []));
  const owner = session.owner || {};
  const section = '/' + (path.split('/')[1] || '');
  const title = TITLES[section] || 'Command';

  return (
    <div className="shell">
      {sideOpen && <div className="scrim" style={{ zIndex: 64 }} onClick={() => setSide(false)} />}
      <aside className={`side ${sideOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <a href="#/" className="brand">
          <span className="brand-logo"><img src="/images/dmd-logo.png" alt="DMD World" /></span>
          <span className="brand-name"><b>DMD World</b><span>Command</span></span>
        </a>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-label">{g.group}</div>
              {g.items.map((it) => {
                const badge = it.badge?.(b);
                return (
                  <a key={it.to} href={`#${it.to}`} className={`nav-item ${active(path, it.to) ? 'on' : ''}`} aria-current={active(path, it.to) ? 'page' : undefined} title={it.label}>
                    <Icon name={it.icon} /><span>{it.label}</span>
                    {badge && <em className={`count ${badge[1]}`} style={{ fontStyle: 'normal' }}>{badge[0] > 99 ? '99+' : badge[0]}</em>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="conn" title={owner.email}>
            <span className="led green pulse" />
            <span>{owner.name || 'Owner'}<small>{owner.email}</small></span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button type="button" className="icon-btn burger" aria-label="Open navigation" onClick={() => setSide(true)}><Icon name="menu" /></button>
          <div className="top-title"><span>DMD World</span><b>{title}</b></div>
          <button type="button" className="search-trigger" onClick={() => setPalette(true)} aria-label="Search and commands">
            <Icon name="search" /><span>Search or jump to…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="menu-wrap">
            <Button variant="primary" icon="plus" onClick={() => setQuick((v) => !v)} aria-expanded={quickOpen} aria-label="New" aria-haspopup="menu"><span className="hide-sm">New</span></Button>
            {quickOpen && (
              <div className="menu" role="menu">
                {QUICK.map((q) => <a key={q.to} href={`#${q.to}`} role="menuitem"><Icon name={q.icon} />{q.label}</a>)}
              </div>
            )}
          </div>
          <a className="icon-btn" href="#/notifications" aria-label={`Notifications${b.notifications ? `, ${b.notifications} new` : ''}`}>
            <Icon name="bell" />{b.notifications > 0 && <span className="dot">{b.notifications > 99 ? '99+' : b.notifications}</span>}
          </a>
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={onSignOut}><Icon name="logout" /></button>
        </header>
        <main className="content" id="main">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {[['/', 'dashboard', 'Home'], ['/orders', 'receipt', 'Orders', b.pending], ['/products', 'box', 'Products'], ['/messages', 'chat', 'Inbox', b.messages]].map(([to, icon, label, count]) => (
          <a key={to} href={`#${to}`} className={active(path, to) ? 'on' : ''}><Icon name={icon} />{label}{count > 0 && <span className="count">{count}</span>}</a>
        ))}
        <button type="button" onClick={() => setSide(true)}><Icon name="menu" />More</button>
      </nav>

      {paletteOpen && <Palette onClose={() => setPalette(false)} badges={b} />}
    </div>
  );
}

/* Command palette: every section, every quick action, and live search across products, orders and buyers. */
function Palette({ onClose, badges }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const dq = useDebounced(q, 160);
  const [found, setFound] = useState({ products: [], orders: [], customers: [] });
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    if (dq.trim().length < 2) { setFound({ products: [], orders: [], customers: [] }); return undefined; }
    api.get(`/search?q=${encodeURIComponent(dq.trim())}`).then((r) => live && setFound(r.data)).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  const s = q.trim().toLowerCase();
  const items = useMemo(() => {
    const out = [];
    const actions = QUICK.filter((a) => !s || a.label.toLowerCase().includes(s)).map((a) => ({ group: 'Actions', icon: a.icon, label: a.label, to: a.to }));
    const go = NAV.flatMap((g) => g.items).filter((n) => !s || n.label.toLowerCase().includes(s)).map((n) => ({ group: 'Go to', icon: n.icon, label: n.label, to: n.to, hint: n.badge?.(badges)?.[0] }));
    out.push(...found.orders.map((o) => ({ group: 'Orders', icon: 'receipt', label: `#${o.number} · ${o.customer}`, to: `/orders/${o.id}`, hint: money(o.total) })));
    out.push(...found.products.map((p) => ({ group: 'Products', icon: 'box', label: p.name, to: `/products/${p.id}`, hint: p.sku || `ID ${p.id}` })));
    out.push(...found.customers.map((c) => ({ group: 'Buyers', icon: 'users', label: c.name, to: `/customers/${c.id}`, hint: c.email })));
    out.push(...actions, ...go);
    return out;
  }, [s, found, badges]);
  useEffect(() => setI(0), [s, found]);
  const choose = (it) => { if (!it) return; navigate(it.to); onClose(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[i]); }
    else if (e.key === 'Escape') onClose();
  };
  let last = null;
  return (
    <>
      <div className="scrim palette-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-input">
          <Icon name="search" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search orders, products, buyers… or type a command" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" role="listbox">
          {items.map((it, k) => {
            const head = it.group !== last ? <div className="palette-group" key={`g-${it.group}`}>{it.group}</div> : null;
            last = it.group;
            return [head, (
              <button key={`${it.group}-${it.to}-${k}`} type="button" role="option" aria-selected={k === i} className={`palette-item ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => choose(it)}>
                <Icon name={it.icon} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>{it.hint != null && it.hint !== '' && <small>{it.hint}</small>}
              </button>
            )];
          })}
          {!items.length && <div className="empty" style={{ padding: 28 }}><p>Nothing matches “{q}”.</p></div>}
        </div>
      </div>
    </>
  );
}
