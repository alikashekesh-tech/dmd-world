import { useRef, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { BRAND_GROUPS } from '../../data/dmdMenu.js';
import { ArrowRight } from '../common/icons.jsx';
import Rail from '../ui/Rail.jsx';
import { useLanding } from './data.js';
import PlatformArt, { PlatformIcon } from './PlatformArt.jsx';
import MiniCard from './MiniCard.jsx';
import useInView from './useInView.js';
import useTween from './useTween.js';
import s from './PlatformPicker.module.css';

/* One question instead of 112 categories. The answer is remembered, so a returning visitor lands on their own shelf.
   The chooser is the last of the ink stage that starts with the hero; its panel bridges into the light page, and the
   products that fit the platform sit below it on the light shelf, where white product photos belong. */
const KEY = 'dmd:platform';
const readSaved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export default function PlatformPicker() {
  const { PLATFORMS } = useLanding();
  const [saved] = useState(() => PLATFORMS.find((x) => x.id === readSaved()) || null);
  const [id, setId] = useState(saved?.id || 'playstation');
  const [ref, { seen, live }] = useInView({ threshold: 0.12 });
  const tabs = useRef([]);
  const p = PLATFORMS.find((x) => x.id === id);
  const count = useTween(0, p.count ?? BRAND_GROUPS.length, seen, { duration: 900 });

  const choose = (next) => {
    setId(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode: just don't remember */ }
  };
  const onKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const j = (i + step + PLATFORMS.length) % PLATFORMS.length;
    choose(PLATFORMS[j].id);
    tabs.current[j]?.focus();
  };

  return (
    <section id="platform" ref={ref} className={s.sec} data-paused={!live || undefined} aria-labelledby="pp-title">
      <div className={s.stage}>
        <div className="container">
          <div className={s.head}>
            <p className={s.eyebrow}>01 · Your platform</p>
            <h2 id="pp-title" className={s.title}>What do you play on?</h2>
            <p className={s.sub}>
              {saved ? <>Welcome back. We kept <b>{saved.name}</b> selected for you.</> : <>Pick one. We’ll show what fits it, and remember your answer next time.</>}
            </p>
          </div>

          <div role="tablist" aria-label="Platforms" className={s.tabs}>
            {PLATFORMS.map((x, i) => (
              <button
                key={x.id}
                ref={(el) => { tabs.current[i] = el; }}
                type="button"
                role="tab"
                id={`pp-tab-${x.id}`}
                aria-selected={x.id === id}
                aria-controls="pp-panel"
                tabIndex={x.id === id ? 0 : -1}
                className={s.tab}
                onClick={() => choose(x.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <PlatformIcon id={x.id} />
                <span className={s.full}>{x.name}</span>
                <span className={s.short} aria-hidden="true">{x.short}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel" id="pp-panel" aria-labelledby={`pp-tab-${id}`} className={s.panel}>
            <div className={s.stageArt}>
              <PlatformArt key={id} id={id} />
            </div>
            <div className={s.info} key={id}>
              <h3 className={s.name}>{p.name}</h3>
              <p className={s.count}><b>{Math.round(count)}</b><span>{p.count != null ? 'products in store' : 'gear brands in store'}</span></p>
              <p className={s.line}>{p.line}</p>
              <ul className={s.links}>{p.links.map(([label, to]) => <li key={label}><Link to={to}>{label}</Link></li>)}</ul>
              <Link to={p.to} className={s.cta}>Shop {p.name} <ArrowRight size={17} /></Link>
            </div>
          </div>
        </div>
      </div>

      <div className={`container ${s.shelf}`}>
        {p.products.length > 0 && (
          <Rail
            key={id}
            label={`In stock now: ${p.name}`}
            title={<h3 className={s.railTitle}>In stock now <span className={s.full}>{p.name}</span><span className={s.short}>{p.short}</span></h3>}
            aside={<Link to={p.to} className={s.seeAll}>See all <ArrowRight size={14} /></Link>}
          >
            {p.products.map((x) => <MiniCard key={x.id} product={x} />)}
          </Rail>
        )}
      </div>
    </section>
  );
}
