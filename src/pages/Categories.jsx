import { Link } from '../router/index.jsx';
import PageHero, { HeroStats } from '../components/ui/PageHero.jsx';
import LineArt from '../components/art/LineArt.jsx';
import CategoryArt, { artFor } from '../components/art/CategoryArt.jsx';
import { MENU_SECTIONS, groupBySlug, group, catUrl } from '../data/dmdMenu.js';
import { useCatalog } from '../data/live.js';
import { ArrowRight } from '../components/common/icons.jsx';
import { usePageMeta } from '../lib/meta.js';
import s from './Categories.module.css';

export default function Categories() {
  usePageMeta({ title: 'All categories', description: 'Browse DMD World by category or brand: PlayStation, Nintendo Switch, Xbox, PC parts, laptops, tablets, gadgets and the gear brands we stock.' });
  useCatalog(); // the tree comes with the catalog
  const [cats = { slugs: [] }, brands = { slugs: [] }] = MENU_SECTIONS;
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Categories' }]}
        eyebrow="Map · every corner of the store"
        title="All categories"
        lead="Browse the full DMD World catalog by what it is or by who makes it."
        art={<LineArt type="shelf" />}
      >
        <HeroStats items={[['Categories', cats.slugs.length], ['Brands', brands.slugs.length], ['PlayStation products', group('playstation').count]]} />
      </PageHero>
      <div className="container" style={{ paddingBottom: 80 }}>
        {MENU_SECTIONS.map((sec, i) => (
          <section key={sec.label} className={s.sec} aria-labelledby={`sec${i}`}>
            <div className="section-head"><div><p className="eyebrow">0{i + 1} · {i ? 'Who makes it' : 'What it is'}</p><h2 id={`sec${i}`}>{sec.label}</h2></div></div>
            <ul className={s.grid}>
              {sec.slugs.map((sl, k) => {
                const g = groupBySlug[sl];
                const kids = g.children || [];
                return (
                  <li key={sl} className={s.card} style={{ '--i': k }}>
                    <Link to={catUrl(sl)} className={s.top}>
                      <CategoryArt spec={artFor([g])} className={s.img} />
                      <span className={s.name}>{g.name}<ArrowRight size={16} /></span>
                      {g.count > 0 && <span className={s.count}>{g.count.toLocaleString()} products</span>}
                    </Link>
                    {kids.length > 0 && (
                      <ul className={s.subs}>
                        {kids.slice(0, 6).map((c) => <li key={c.slug}><Link to={catUrl(sl, c.slug)}>{c.name}</Link></li>)}
                        {kids.length > 6 && <li><Link to={catUrl(sl)} className={s.more}>+{kids.length - 6} more</Link></li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
