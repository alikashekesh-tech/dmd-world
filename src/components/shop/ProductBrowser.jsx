import { useMemo, useState } from 'react';
import { Link } from '../../router/index.jsx';
import ProductCard from '../product/ProductCard.jsx';
import FilterPanel from './FilterPanel.jsx';
import useFilters from './useFilters.js';
import { useDialog } from '../../lib/useDialog.js';
import { useCatalog } from '../../data/live.js';
import { applyFilters, sortProducts, SORTS, FACET_LABELS, facetLabel, money } from '../../data/index.js';
import { FilterIcon, CloseIcon } from '../common/icons.jsx';
import Breadcrumbs from '../ui/Breadcrumbs.jsx';
import PageHero from '../ui/PageHero.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LineArt from '../art/LineArt.jsx';
import s from './ProductBrowser.module.css';

export { Breadcrumbs };

const ALL_KEYS = Object.keys(FACET_LABELS);
const PAGE = 24;


/**
 * Generic, URL-driven product listing with dynamic filters.
 * @param base      products in scope (already narrowed by the route)
 * @param keysFor   (state) => facet keys to show for the current selection
 */
export default function ProductBrowser({ base, keysFor, crumbs, title, eyebrow, blurb, headerExtra, chips, chipRows, bare, art, accent }) {
  const { state, sort, update, toggle, clearAll, params, setParams } = useFilters(ALL_KEYS);
  const [sheet, setSheet] = useState(false);
  const keys = keysFor(state);
  const version = useCatalog(); // the live catalog replaces products in place: re-filter when it changes
  const filtered = useMemo(() => sortProducts(applyFilters(base, state), sort), [base, state, sort, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => ({ min: Math.floor(Math.min(...base.map((p) => p.price), 0)), max: Math.ceil(Math.max(...base.map((p) => p.price), 1)) }), [base, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = Number(params.get('page') || 1);
  const shown = filtered.slice(0, page * PAGE);

  const sheetRef = useDialog(sheet, () => setSheet(false));

  const active = [];
  for (const k of keys.concat(ALL_KEYS.filter((x) => !keys.includes(x)))) for (const v of state[k] || []) active.push({ k, v, label: facetLabel(k, v), group: FACET_LABELS[k] });
  if (state.price) active.push({ k: 'price', label: state.price[1] === Infinity ? `${money(state.price[0])}+` : `${money(state.price[0])} – ${money(state.price[1])}` });
  if (state.rating) active.push({ k: 'rating', label: `${state.rating}★ & up` });
  if (state.stock) active.push({ k: 'stock', label: 'In stock' });
  if (state.q) active.push({ k: 'q', label: `“${state.q}”` });
  const remove = (a) => (a.v !== undefined ? toggle(a.k, a.v) : update({ [a.k]: null }));

  return (
    <>
      {!bare && <PageHero crumbs={crumbs} eyebrow={eyebrow} title={title} lead={blurb} art={art} accent={accent}>{headerExtra}</PageHero>}
      <div className="container">
      {[...(chipRows || []), chips].filter((r) => r && r.length > 0).map((row, ri) => (
        <div key={ri} className={s.chips} role="navigation" aria-label="Subcategories">
          {row.map((c) => <Link key={c.label} to={c.to} className={`${s.chip} ${c.active ? s.chipOn : ''}`}>{c.label}{c.count != null && <small>{c.count}</small>}</Link>)}
        </div>
      ))}
      <div className={s.layout}>
        <aside className={s.side} aria-label="Filters">
          <div className={s.sideHead}><h2>Filters</h2>{active.length > 0 && <button type="button" onClick={clearAll}>Clear all</button>}</div>
          <FilterPanel base={base} keys={keys} state={state} toggle={toggle} update={update} bounds={bounds} />
        </aside>
        <div className={s.results}>
          <div className={s.toolbar}>
            <p className={s.count} aria-live="polite"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'result' : 'results'}</p>
            <div className={s.tools}>
              <button type="button" className={`btn btn--dark btn--sm ${s.filterBtn}`} onClick={() => setSheet(true)}><FilterIcon size={17} />Filters{active.length > 0 && <b>{active.length}</b>}</button>
              <label className={s.sort}>
                <span className="sr-only">Sort by</span>
                <select className="input" value={sort} onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value === 'featured') n.delete('sort'); else n.set('sort', e.target.value); setParams(n); }}>
                  {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          {active.length > 0 && (
            <div className={s.active}>
              {active.map((a) => <button key={`${a.k}-${a.v ?? ''}`} type="button" onClick={() => remove(a)} aria-label={`Remove filter ${a.label}`}>{a.label}<CloseIcon size={13} /></button>)}
              <button type="button" className={s.clear} onClick={clearAll}>Clear all</button>
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState art={<LineArt type="controller" />} status="No match" title="Nothing fits that combo" text="Try removing a filter or widening the price range."><button className="btn btn--primary" type="button" onClick={clearAll}>Clear all filters</button></EmptyState>
          ) : (
            <>
              <div className={s.grid}>{shown.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}</div>
              {shown.length < filtered.length && (
                <div className={s.loadMore}>
                  <p>{shown.length} / {filtered.length} loaded</p>
                  <div className={s.bar} aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < Math.round((shown.length / filtered.length) * 20) ? s.on : undefined} />)}</div>
                  <button type="button" className="btn btn--secondary" onClick={() => { const n = new URLSearchParams(params); n.set('page', String(page + 1)); setParams(n, { noScroll: true }); }}>Load more</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`${s.sheet} ${sheet ? s.sheetOpen : ''}`} aria-hidden={!sheet}>
        <div className={s.scrim} onClick={() => setSheet(false)} />
        <div ref={sheetRef} className={s.sheetBody} role="dialog" aria-modal="true" aria-label="Filters">
          <div className={s.sheetHead}><h2>Filters</h2><button type="button" onClick={() => setSheet(false)} aria-label="Close filters"><CloseIcon /></button></div>
          <div className={s.sheetScroll}>
            {sheet && <FilterPanel base={base} keys={keys} state={state} toggle={toggle} update={update} bounds={bounds} />}
          </div>
          <div className={s.sheetFoot}>
            <button type="button" className="btn btn--secondary" onClick={clearAll}>Clear all</button>
            <button type="button" className="btn btn--primary" onClick={() => setSheet(false)}>Show {filtered.length} results</button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
