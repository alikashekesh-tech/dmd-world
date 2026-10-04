import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import CategoryArt, { artFor } from '../art/CategoryArt.jsx';
import { ArrowRight, ChevronRight } from '../common/icons.jsx';
import { DMD_GROUPS, MENU_SECTIONS, groupBySlug, catUrl } from '../../data/dmdMenu.js';
import s from './MegaMenu.module.css';

export default function MegaMenu({ onNavigate }) {
  const [active, setActive] = useState('playstation');
  const g = groupBySlug[active];
  const kids = g.children || [];
  const nested = kids.some((k) => k.children?.length);
  const leaves = kids.filter((k) => !k.children?.length);
  const branches = kids.filter((k) => k.children?.length);

  return (
    <div className={s.panel} role="region" aria-label="Categories">
      <div className={`container ${s.inner}`}>
        <nav className={s.left} aria-label="Category groups">
          {MENU_SECTIONS.map((sec, i) => (
            <div key={sec.label} className={s.sec}>
              <h4>{sec.label}</h4>
              <ul className={i ? s.brandGrid : ''}>{sec.slugs.map((sl) => { const x = groupBySlug[sl]; return (
                <li key={sl}>
                  <Link to={catUrl(sl)} className={`${s.gl} ${active === sl ? s.cur : ''}`} onMouseEnter={() => setActive(sl)} onFocus={() => setActive(sl)} onClick={onNavigate}>
                    {x.name}{(x.children?.length > 0) && <ChevronRight size={14} />}
                  </Link>
                </li>
              ); })}</ul>
            </div>
          ))}
        </nav>

        <div className={s.mid}>
          <div className={s.midHead}>
            <h3>{g.name}</h3>
            <Link to={catUrl(g.slug)} onClick={onNavigate} className={s.all}>Shop all {g.name} <ArrowRight size={15} /></Link>
          </div>
          {kids.length === 0 ? (
            <p className={s.empty}>Browse the full {g.name} range, new arrivals and offers.</p>
          ) : (
            <div className={s.cols}>
              {branches.map((b) => (
                <div key={b.slug} className={s.col}>
                  <Link to={catUrl(g.slug, b.slug)} onClick={onNavigate} className={s.colHead}>{b.name}</Link>
                  <ul>{b.children.map((c) => (
                    <li key={c.slug}>
                      <Link to={catUrl(g.slug, b.slug, c.slug)} onClick={onNavigate}>{c.name}</Link>
                      {c.children?.length > 0 && <span className={s.tags}>{c.children.map((d) => <Link key={d.slug} to={catUrl(g.slug, b.slug, c.slug, d.slug)} onClick={onNavigate}>{d.name}</Link>)}</span>}
                    </li>
                  ))}</ul>
                </div>
              ))}
              {leaves.length > 0 && (
                <div className={`${s.col} ${nested ? '' : s.wideCol}`}>
                  {nested && <span className={s.colHead}>More</span>}
                  <ul className={nested ? '' : s.twoUp}>{leaves.map((c) => (
                    <li key={c.slug}>
                      <Link to={catUrl(g.slug, c.slug)} onClick={onNavigate}>{c.name}</Link>
                      {c.children?.length > 0 && <span className={s.tags}>{c.children.map((d) => <Link key={d.slug} to={catUrl(g.slug, c.slug, d.slug)} onClick={onNavigate}>{d.name}</Link>)}</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className={s.feature}>
          <Link to={catUrl(g.slug)} onClick={onNavigate} className={s.featCard}>
            <CategoryArt key={g.slug} spec={artFor([g])} className={s.featImg} />
            <span className={s.featTxt}><em>{g.brand ? 'Brand' : 'Category'}{g.count > 0 ? ` · ${g.count.toLocaleString()} products` : ''}</em><strong>{g.name}</strong><small>{g.blurb || `Shop the ${g.name} range`}</small></span>
          </Link>
          <Link to="/product-category/new-offers" onClick={onNavigate} className={s.offer}><span><em>Limited time</em><b>New Offers</b></span><ArrowRight size={18} /></Link>
        </aside>
      </div>
      <div className={s.bar}><div className={`container ${s.barIn}`}>
        <Link to="/categories" onClick={onNavigate} className={s.viewAll}>View All Categories <ArrowRight size={15} /></Link>
        <span className={s.quick}><Link to="/product-category/new-offers" onClick={onNavigate}>New Offers</Link><Link to="/brands" onClick={onNavigate}>All Brands</Link></span>
      </div></div>
    </div>
  );
}
