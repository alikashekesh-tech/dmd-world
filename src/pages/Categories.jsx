import { Link } from '../router/index.jsx';
import PageHero, { HeroStats } from '../components/ui/PageHero.jsx';
import LineArt from '../components/art/LineArt.jsx';
import CategoryArt, { artFor } from '../components/art/CategoryArt.jsx';
import { MENU_SECTIONS, groupBySlug, group, catUrl } from '../data/dmdMenu.js';
import { DEPARTMENTS } from '../data/departments.js';
import { useCatalog } from '../data/live.js';
import { ArrowRight } from '../components/common/icons.jsx';
import { usePageMeta } from '../lib/meta.js';
import s from './Categories.module.css';

/** A card: the category, its count, and up to six of its sub-categories. */
function Card({ name, to, art, count, subs, i }) {
  return (
    <li className={s.card} style={{ '--i': i }}>
      <Link to={to} className={s.top}>
        <CategoryArt spec={art} className={s.img} />
        <span className={s.name}>{name}<ArrowRight size={16} /></span>
        {count > 0 && <span className={s.count}>{count.toLocaleString()} products</span>}
      </Link>
      {subs.length > 0 && (
        <ul className={s.subs}>
          {subs.slice(0, 6).map((c) => <li key={c.to}><Link to={c.to}>{c.name}</Link></li>)}
          {subs.length > 6 && <li><Link to={to} className={s.more}>+{subs.length - 6} more</Link></li>}
        </ul>
      )}
    </li>
  );
}

export default function Categories() {
  usePageMeta({ title: 'All categories', description: 'Browse DMD World by category or brand: gaming accessories, gaming furniture, consoles, laptops, tablets, gadgets and the gear brands we stock.' });
  useCatalog(); // the tree comes with the catalog
  const brands = MENU_SECTIONS[1] || { label: 'Shop by brand', slugs: [] };
  const brandSlugs = brands.slugs.filter((sl) => groupBySlug[sl]);
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Categories' }]}
        eyebrow="Map · every corner of the store"
        title="All categories"
        lead="Browse the full DMD World catalog by what it is or by who makes it."
        art={<LineArt type="shelf" />}
      >
        <HeroStats items={[['Categories', DEPARTMENTS.length], ['Brands', brandSlugs.length], ['PlayStation products', group('playstation').count]]} />
      </PageHero>
      <div className="container" style={{ paddingBottom: 80 }}>
        <section className={s.sec} aria-labelledby="sec0">
          <div className="section-head"><div><p className="eyebrow">01 · What it is</p><h2 id="sec0">Shop by category</h2></div></div>
          <ul className={s.grid}>
            {DEPARTMENTS.map((d, k) => <Card key={d.slug} i={k} name={d.name} to={d.to} art={d.art} count={d.count} subs={d.children} />)}
          </ul>
        </section>
        {brandSlugs.length > 0 && (
          <section className={s.sec} aria-labelledby="sec1">
            <div className="section-head"><div><p className="eyebrow">02 · Who makes it</p><h2 id="sec1">{brands.label}</h2></div></div>
            <ul className={s.grid}>
              {brandSlugs.map((sl, k) => {
                const g = groupBySlug[sl];
                return <Card key={sl} i={k} name={g.name} to={catUrl(sl)} art={artFor([g])} count={g.count} subs={(g.children || []).map((c) => ({ name: c.name, to: catUrl(sl, c.slug) }))} />;
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
