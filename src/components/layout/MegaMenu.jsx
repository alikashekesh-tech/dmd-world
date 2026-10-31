import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from '../../router/index.jsx';
import CategoryArt, { artFor } from '../art/CategoryArt.jsx';
import { ArrowRight, ChevronRight } from '../common/icons.jsx';
import { MENU_SECTIONS, groupBySlug, catUrl } from '../../data/dmdMenu.js';
import { DEPARTMENTS, isRetired } from '../../data/departments.js';
import { useCatalog } from '../../data/live.js';
import { useScrollLock } from '../../lib/useDialog.js';
import s from './MegaMenu.module.css';

/** A category and what's under it, as menu links (retired and empty sub-categories left out). */
const item = (n) => ({ key: n.slug, name: n.name, to: catUrl(...n.path), children: (n.children || []).filter((c) => c.count > 0 && !isRetired(c)).map(item) });

/* The categories menu: main categories (and brands) on the left; the one pointed at opens its sub-categories. */
export default function MegaMenu({ onNavigate }) {
  useCatalog(); // the tree comes with the catalog
  useScrollLock(true); // the page stays put while the menu is open (the menu scrolls itself if it must)
  const panel = useRef(null);
  const [maxH, setMaxH] = useState(null);
  useLayoutEffect(() => { const top = panel.current?.getBoundingClientRect().top; if (top != null) setMaxH(window.innerHeight - top); }, []);

  const [active, setActive] = useState(() => (DEPARTMENTS[0] ? `d:${DEPARTMENTS[0].slug}` : null));
  const [kind, slug] = (active || ':').split(':');
  const dept = kind === 'd' ? DEPARTMENTS.find((x) => x.slug === slug) : null;
  const brand = kind === 'b' ? groupBySlug[slug] : null;
  const g = dept
    ? { name: dept.name, to: dept.to, art: dept.art, label: 'Category', count: dept.count, blurb: dept.blurb, items: dept.children.map((x) => ({ key: x.slug, name: x.name, to: x.to, children: x.node ? item(x.node).children : [] })) }
    : brand ? { name: brand.name, to: catUrl(brand.slug), art: artFor([brand]), label: 'Brand', count: brand.count, blurb: brand.blurb, items: brand.children.map(item) } : null;
  const kids = g?.items || [];
  const nested = kids.some((k) => k.children.length);
  const leaves = kids.filter((k) => !k.children.length);
  const branches = kids.filter((k) => k.children.length);
  const brands = (MENU_SECTIONS[1]?.slugs || []).filter((sl) => groupBySlug[sl]);
  const entry = (key, name, to, hasKids) => (
    <li key={key}>
      <Link to={to} className={`${s.gl} ${active === key ? s.cur : ''}`} onMouseEnter={() => setActive(key)} onFocus={() => setActive(key)} onClick={onNavigate}>
        {name}{hasKids && <ChevronRight size={14} />}
      </Link>
    </li>
  );

  return (
    <div ref={panel} className={s.panel} role="region" aria-label="Categories" style={maxH ? { maxHeight: maxH } : undefined}>
      <div className={`container ${s.inner}`}>
        <nav className={s.left} aria-label="Category groups">
          <div className={s.sec}>
            <h4>Shop by category</h4>
            <ul>{DEPARTMENTS.map((d) => entry(`d:${d.slug}`, d.name, d.to, true))}</ul>
          </div>
          {brands.length > 0 && (
            <div className={s.sec}>
              <h4>{MENU_SECTIONS[1].label}</h4>
              <ul className={s.brandGrid}>{brands.map((sl) => entry(`b:${sl}`, groupBySlug[sl].name, catUrl(sl), groupBySlug[sl].children?.length > 0))}</ul>
            </div>
          )}
        </nav>

        {g && (
          <div className={s.mid}>
            <div className={s.midHead}>
              <h3>{g.name}</h3>
              <Link to={g.to} onClick={onNavigate} className={s.all}>Shop all {g.name} <ArrowRight size={15} /></Link>
            </div>
            {kids.length === 0 ? (
              <p className={s.empty}>Browse the full {g.name} range, new arrivals and offers.</p>
            ) : (
              <div className={s.cols}>
                {branches.map((b) => (
                  <div key={b.key} className={s.col}>
                    <Link to={b.to} onClick={onNavigate} className={s.colHead}>{b.name}</Link>
                    <ul>{b.children.map((c) => (
                      <li key={c.key}>
                        <Link to={c.to} onClick={onNavigate}>{c.name}</Link>
                        {c.children.length > 0 && <span className={s.tags}>{c.children.map((d) => <Link key={d.key} to={d.to} onClick={onNavigate}>{d.name}</Link>)}</span>}
                      </li>
                    ))}</ul>
                  </div>
                ))}
                {leaves.length > 0 && (
                  <div className={`${s.col} ${nested ? '' : s.wideCol}`}>
                    {nested && <span className={s.colHead}>More</span>}
                    <ul className={nested ? '' : s.twoUp}>{leaves.map((c) => <li key={c.key}><Link to={c.to} onClick={onNavigate}>{c.name}</Link></li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {g && (
          <aside className={s.feature}>
            <Link to={g.to} onClick={onNavigate} className={s.featCard}>
              <CategoryArt key={g.to} spec={g.art} className={s.featImg} />
              <span className={s.featTxt}><em>{g.label}{g.count > 0 ? ` · ${g.count.toLocaleString()} products` : ''}</em><strong>{g.name}</strong><small>{g.blurb || `Shop the ${g.name} range`}</small></span>
            </Link>
            <Link to="/product-category/new-offers" onClick={onNavigate} className={s.offer}><span><em>Limited time</em><b>New Offers</b></span><ArrowRight size={18} /></Link>
          </aside>
        )}
      </div>
      <div className={s.bar}><div className={`container ${s.barIn}`}>
        <Link to="/categories" onClick={onNavigate} className={s.viewAll}>View All Categories <ArrowRight size={15} /></Link>
        <span className={s.quick}><Link to="/product-category/new-offers" onClick={onNavigate}>New Offers</Link><Link to="/brands" onClick={onNavigate}>All Brands</Link></span>
      </div></div>
    </div>
  );
}
