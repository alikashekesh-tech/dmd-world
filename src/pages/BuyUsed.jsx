import { useMemo } from 'react';
import { Link } from '../router/index.jsx';
import ProductBrowser from '../components/shop/ProductBrowser.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { whatsAppUrl, WhatsAppIcon } from '../components/layout/WhatsAppButton.jsx';
import { ArrowRight } from '../components/common/icons.jsx';
import { PRODUCTS } from '../data/index.js';
import { departmentOptions } from '../data/departments.js';
import { useCatalog } from '../data/live.js';
import { CONDITIONS, CONDITION_ORDER, conditionOf } from '../lib/variants.js';
import { usePageMeta } from '../lib/meta.js';
import s from './BuyUsed.module.css';

const KEYS = () => ['condition', 'brand'];
const CRUMBS = [{ label: 'Home', to: '/' }, { label: 'Buy Used' }];
const LEAD = 'Second-hand consoles, games, controllers, laptops and gear sold by DMD World. Each item has a condition grade and notes, so you know what to expect before you buy.';

/** What each grade means: the same words as on every used product's page. */
function Grades() {
  return (
    <section id="grades" className={s.grades} aria-labelledby="grades-title">
      <div className="section-head"><div><p className="eyebrow">How we grade</p><h2 id="grades-title">Condition grades</h2></div></div>
      <ol className={s.list}>
        {CONDITION_ORDER.map((k, i) => (
          <li key={k} style={{ '--i': i }}>
            <span className={s.step} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <b>{CONDITIONS[k].label}</b>
            <p>{CONDITIONS[k].description}</p>
          </li>
        ))}
      </ol>
      <p className={s.fine}>A grade describes how an item looks. Read each item’s condition notes for the details, and ask us anything before you buy.</p>
    </section>
  );
}

/* Buy Used: second-hand products sold by DMD World itself (not a marketplace between customers). */
export default function BuyUsed() {
  const version = useCatalog();
  usePageMeta({ title: 'Buy Used', description: 'Used consoles, games, controllers, laptops and gaming gear sold by DMD World, each with a condition grade. Order online and pay on delivery in Lebanon.' });
  const base = useMemo(() => PRODUCTS.filter((p) => conditionOf(p)), [version]); // eslint-disable-line react-hooks/exhaustive-deps -- rebuilt with each catalog
  const categories = useMemo(() => departmentOptions(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const art = <LineArt type="controller" />;

  if (!base.length) {
    return (
      <>
        <PageHero crumbs={CRUMBS} eyebrow="Pre-owned · sold by DMD World" title="Buy Used" lead={LEAD} art={art} />
        <div className="container">
          <div className={s.empty}>
            <EmptyState art={<LineArt type="shelf" />} status="Shelf: restocking" title="No used items right now" text="Used items are listed here as they become available. Ask us what’s coming, or browse everything new in the meantime.">
              <a className="btn btn--primary btn--lg" href={whatsAppUrl('Hi DMD World, do you have any used items coming in?')} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} />Ask on WhatsApp</a>
              <Link to="/shop" className="btn btn--secondary btn--lg">Shop new <ArrowRight size={17} /></Link>
            </EmptyState>
          </div>
          <Grades />
        </div>
      </>
    );
  }

  return (
    <>
      <ProductBrowser
        base={base} keysFor={KEYS} categories={categories} crumbs={CRUMBS}
        eyebrow={`Pre-owned · ${base.length.toLocaleString()} ${base.length === 1 ? 'item' : 'items'}`} title="Buy Used" blurb={LEAD} art={art}
        headerExtra={<a href="#grades" className={s.gradeLink}>What our condition grades mean <ArrowRight size={14} /></a>}
      />
      <div className="container"><Grades /></div>
    </>
  );
}
