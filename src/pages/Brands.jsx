import { useState } from 'react';
import { Link } from '../router/index.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import CategoryArt, { artFor } from '../components/art/CategoryArt.jsx';
import { Credits } from '../components/landing/Continue.jsx';
import { useLanding } from '../components/landing/data.js';
import { ArrowRight } from '../components/common/icons.jsx';
import { BRAND_GROUPS, catUrl } from '../data/dmdMenu.js';
import { usePageMeta } from '../lib/meta.js';
import s from './Brands.module.css';

/* Brands are drawn, not shown by logo (README: licensed logos only with each brand's permission). These brands' logos
   may be shown; the file is the one set in the admin (Brands → Logo). Without one, or if it fails to load, the drawing. */
const LOGO_BRANDS = new Set(['marvo']);

function BrandArt({ brand }) {
  const [failed, setFailed] = useState(false);
  if (!LOGO_BRANDS.has(brand.slug) || !brand.img || failed) return <CategoryArt spec={artFor([brand])} className={s.art} />;
  return <span className={`${s.art} ${s.logo}`}><img src={brand.img} alt="" loading="lazy" onError={() => setFailed(true)} /></span>;
}

export function BrandsIndex() {
  usePageMeta({ title: 'Brands', description: 'The gear brands DMD World stocks next to PlayStation, Nintendo and Xbox: Razer, HyperX, Logitech, Marvo, Fantech, Onikuma and more.' });
  const { BRANDS } = useLanding(); // also re-renders when the catalog (and its brands) change
  const half = Math.ceil(BRANDS.length / 2);
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Brands' }]}
        eyebrow={`Brands · ${BRAND_GROUPS.length} gear makers`}
        title="In this world"
        lead="The gear brands DMD World stocks, next to PlayStation, Nintendo and Xbox. Pick one to see everything it makes."
      />
      <div className={s.credits} aria-label="All brands">
        <Credits list={BRANDS.slice(0, half)} />
        <Credits list={BRANDS.slice(half)} reverse />
      </div>
      <div className="container" style={{ paddingBlock: '48px 80px' }}>
        <ul className={s.grid}>
          {BRAND_GROUPS.map((b, i) => (
            <li key={b.slug} style={{ '--i': i }}>
              <Link to={catUrl(b.slug)} className={s.card}>
                <BrandArt brand={b} />
                <span className={s.meta}>
                  <b>{b.name}</b>
                  <small>{b.count.toLocaleString()} products</small>
                </span>
                <ArrowRight size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
