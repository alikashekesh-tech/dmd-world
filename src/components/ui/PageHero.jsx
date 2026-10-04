import { Link } from '../../router/index.jsx';
import Breadcrumbs from './Breadcrumbs.jsx';
import s from './PageHero.module.css';

/* The ink "stage" every inner page opens on: HUD label, big headline, and a line drawing of what the page is about.
   Same dot grid, glow and drawing style as the landing hero, at a height that leaves the content above the fold. */
export default function PageHero({ crumbs, eyebrow, title, lead, art, accent, children, aside, className = '' }) {
  return (
    <section className={`${s.hero} ${className}`} style={accent ? { '--acc': accent } : undefined}>
      <div className={s.glow} aria-hidden="true" />
      <div className={`container ${s.in} ${art || aside ? s.split : ''}`}>
        <div className={s.copy}>
          {crumbs && <Breadcrumbs items={crumbs} className={s.crumbs} />}
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h1 className={s.title}>{title}</h1>
          {lead && <p className={s.lead}>{lead}</p>}
          {children}
        </div>
        {art && <div className={s.art} aria-hidden="true">{art}</div>}
        {aside && <div className={s.aside}>{aside}</div>}
      </div>
    </section>
  );
}

/** Pill links for sub-categories, styled for the ink stage. */
export function HeroChips({ items, label = 'Sub-categories' }) {
  if (!items?.length) return null;
  return (
    <ul className={s.chips} aria-label={label}>
      {items.map((c) => (
        <li key={c.label}>
          <Link to={c.to} className={`${s.chip} ${c.active ? s.chipOn : ''}`} aria-current={c.active ? 'page' : undefined}>
            {c.label}{c.count > 0 && <small>{c.count.toLocaleString()}</small>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small stat row ("720 products · 12 on offer"). */
export function HeroStats({ items }) {
  return (
    <dl className={s.stats}>
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
