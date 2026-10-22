import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { money, num } from '../../lib/format.js';
import { coveredByParent, statusNote, targetsSummary, toggleTarget } from '../../lib/offerTargets.js';
import { Button, Chip, Icon, Tabs, Thumb, Toggle } from '../../ui/kit.jsx';
import Finder from './Finder.jsx';

/* What an offer covers: products, brands and categories (any mix: the tabs only organise them) or the entire store.
   Each tab searches, shows what is chosen as removable items, and counts them. Numbers of products are the ones
   buyers can see (published, not in the trash), from the live preview (`counts`). */

const SHOW = 12;
const STATUS = { published: null, draft: ['amber', 'Draft'], trashed: ['coral', 'In trash'], missing: ['coral', 'Deleted'], deleted: ['muted', 'Archived'] };
const productFromSearch = (p) => ({ id: p.id, name: p.name, sku: p.sku, image: p.image || p.images?.[0]?.url || null, price: p.price, regular_price: p.regular_price,
  status: p.archived_at ? 'trashed' : p.status, variants: p.type === 'variable' || (p.variants?.length > 0) });

function StatusChip({ status }) {
  const s = STATUS[status];
  return s ? <Chip tone={s[0]}>{s[1]}</Chip> : null;
}

/** A chosen item: what it is, a note when it needs attention, and a remove button. */
function Picked({ children, note, onRemove, label, tone }) {
  return (
    <li className={`tp-item ${tone || ''}`}>
      <div className="tp-item-main">{children}{note && <small className="tp-note">{note}</small>}</div>
      <button type="button" className="tp-x" aria-label={`Remove ${label}`} title="Remove" onClick={onRemove}><Icon name="close" size={14} /></button>
    </li>
  );
}

function Collapsible({ items, render, empty }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="tp-empty">{empty}</p>;
  const shown = all ? items : items.slice(0, SHOW);
  return (
    <>
      <ul className="tp-list">{shown.map(render)}</ul>
      {items.length > SHOW && <button type="button" className="linkish tp-more" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${num(items.length)}`}</button>}
    </>
  );
}

function ProductsTab({ value, onChange }) {
  const t = value;
  const search = (q) => api.get(`/products?q=${encodeURIComponent(q)}&per_page=12`).then((r) => r.data.map(productFromSearch));
  return (
    <div className="tp-panel">
      <Finder remote label="Search products" placeholder="Search by product name or SKU…" minChars={2} hint="Type 2 or more letters of a product name or SKU."
        load={search} picked={(p) => t.products.some((x) => x.id === p.id)} onPick={(p) => onChange(toggleTarget(t, 'products', p))}
        render={(p) => (
          <>
            <Thumb src={p.image} size="sm" />
            <span className="finder-main"><b className="clamp1">{p.name}</b><small className="mono">{p.sku || 'No SKU'} · {money(p.price)}{p.variants ? ' · variants' : ''}</small></span>
            <StatusChip status={p.status} />
          </>
        )} />
      <Collapsible items={t.products} empty="No individual products chosen. Search above to add some."
        render={(p) => (
          <Picked key={p.id} label={p.name || `product ${p.id}`} note={statusNote(p)} tone={p.status === 'missing' || p.status === 'trashed' ? 'warn' : ''} onRemove={() => onChange({ ...t, products: t.products.filter((x) => x.id !== p.id) })}>
            {p.status === 'missing' ? <span className="thumb sm none"><Icon name="alert" /></span> : <Thumb src={p.image} size="sm" />}
            <span className="tp-text"><b className="clamp1">{p.status === 'missing' ? 'Deleted product' : p.name || `Product #${p.id}`}</b><small className="mono">{p.status === 'missing' ? `#${p.id}` : `${p.sku || 'No SKU'} · ${money(p.price)}${p.price !== p.regular_price && p.regular_price != null ? ` (regular ${money(p.regular_price)})` : ''}`}</small></span>
            <StatusChip status={p.status} />
          </Picked>
        )} />
      {t.products.length > 5 && <button type="button" className="linkish tp-clear" onClick={() => onChange({ ...t, products: [] })}>Remove all {num(t.products.length)} products</button>}
    </div>
  );
}

function BrandsTab({ value, onChange, brands, counts }) {
  const t = value;
  const load = (q) => brands.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40).map((b) => ({ id: b.id, name: b.name, status: b.archived_at ? 'deleted' : 'ok' }));
  return (
    <div className="tp-panel">
      <Finder label="Search brands" placeholder="Search brands…" load={load} picked={(b) => t.brands.some((x) => x.id === b.id)} onPick={(b) => onChange(toggleTarget(t, 'brands', b))}
        render={(b) => <span className="finder-main"><b>{b.name}</b><small>Every product of this brand, whatever its category</small></span>} />
      <Collapsible items={t.brands} empty="No brands chosen. A brand covers all its products, in every category."
        render={(b) => (
          <Picked key={b.id} label={b.name || `brand ${b.id}`} note={statusNote(b)} tone={b.status === 'missing' ? 'warn' : ''} onRemove={() => onChange({ ...t, brands: t.brands.filter((x) => x.id !== b.id) })}>
            <span className="thumb sm none"><Icon name="badge" /></span>
            <span className="tp-text"><b>{b.status === 'missing' ? 'Deleted brand' : b.name || `Brand #${b.id}`}</b><small>{counts?.brands?.[b.id] != null ? `${num(counts.brands[b.id])} products in the shop` : ' '}</small></span>
            <StatusChip status={b.status} />
          </Picked>
        )} />
    </div>
  );
}

function CategoriesTab({ value, onChange, categories, counts }) {
  const t = value;
  const kids = useMemo(() => { const m = {}; for (const c of categories) (m[c.parent] ||= []).push(c); return m; }, [categories]);
  const subCount = (id) => { let n = 0; const walk = (p) => { for (const c of kids[p] || []) { n++; walk(c.id); } }; walk(id); return n; };
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pathOf = (c) => { const names = []; let p = byId.get(c.parent); while (p) { names.unshift(p.label || p.name); p = byId.get(p.parent); } return names.join(' › '); };
  const ordered = useMemo(() => {
    const out = []; const walk = (p, depth) => { for (const c of (kids[p] || []).sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name))) { out.push({ ...c, depth }); walk(c.id, depth + 1); } };
    walk(0, 0); return out;
  }, [kids]);
  const load = (q) => {
    const s = q.toLowerCase();
    const list = s ? ordered.filter((c) => (c.label || c.name).toLowerCase().includes(s) || pathOf(c).toLowerCase().includes(s)) : ordered;
    return list.slice(0, 80).map((c) => ({ id: c.id, name: c.name, label: c.label || c.name, path: pathOf(c), depth: s ? 0 : c.depth, subs: subCount(c.id), status: 'ok' }));
  };
  const inParent = coveredByParent(t.categories, categories);
  return (
    <div className="tp-panel">
      <Finder label="Search categories" placeholder="Search categories, or open the list…" load={load} picked={(c) => t.categories.some((x) => x.id === c.id)} onPick={(c) => onChange(toggleTarget(t, 'categories', c))}
        render={(c) => <span className="finder-main" style={{ paddingLeft: c.depth * 16 }}><b>{c.label}</b><small>{[c.path, c.subs ? `includes ${c.subs} subcategor${c.subs === 1 ? 'y' : 'ies'}` : null].filter(Boolean).join(' · ') || 'Top level'}</small></span>} />
      <Collapsible items={t.categories} empty="No categories chosen. A category covers its products and everything in its subcategories."
        render={(c) => {
          const known = byId.get(c.id);
          const subs = known ? subCount(c.id) : (c.subcategories ?? 0);
          const where = known ? pathOf(known) : (c.path || '').split(' › ').slice(0, -1).join(' › ');
          return (
            <Picked key={c.id} label={c.label || c.name || `category ${c.id}`} tone={c.status === 'missing' ? 'warn' : ''}
              note={statusNote(c) || (inParent[c.id] ? `Already included in “${inParent[c.id]}”` : null)} onRemove={() => onChange({ ...t, categories: t.categories.filter((x) => x.id !== c.id) })}>
              <span className="thumb sm none"><Icon name="folder" /></span>
              <span className="tp-text"><b>{c.status === 'missing' ? 'Deleted category' : c.label || c.name || `Category #${c.id}`}</b>
                <small>{[where, subs ? `+ ${subs} subcategor${subs === 1 ? 'y' : 'ies'}` : null, counts?.categories?.[c.id] != null ? `${num(counts.categories[c.id])} products in the shop` : null].filter(Boolean).join(' · ') || ' '}</small></span>
              <StatusChip status={c.status} />
            </Picked>
          );
        }} />
    </div>
  );
}

function StoreTab({ value, onChange, eligible }) {
  const t = value;
  return (
    <div className="tp-panel">
      <div className={`tp-store ${t.entire_store ? 'on' : ''}`}>
        <div className="grow">
          <b>Apply to the entire store</b>
          <p>Every published product{t.entire_store && eligible != null ? ` (${num(eligible)} right now)` : ''}, including products you publish while the offer runs. Drafts and products in the trash are never discounted. Each product still gets its lowest price: an own sale or another offer that is cheaper wins.</p>
        </div>
        <Toggle checked={t.entire_store} onChange={(v) => onChange({ ...t, entire_store: v })} label={<span className="sr">Apply to the entire store</span>} />
      </div>
      {t.entire_store && (t.products.length + t.brands.length + t.categories.length > 0) && (
        <p className="tp-hint"><Icon name="info" size={14} />Your product, brand and category picks are kept, but the entire store already includes them. Switch this off to go back to just those.</p>
      )}
    </div>
  );
}

export default function TargetPicker({ value, onChange, brands, categories, counts, eligible, error }) {
  const [tab, setTab] = useState(() => (value.entire_store ? 'store' : value.brands.length && !value.products.length ? 'brands' : value.categories.length && !value.products.length ? 'categories' : 'products'));
  return (
    <div className={`tp ${error ? 'has-err' : ''}`}>
      <Tabs label="What the offer covers" value={tab} onChange={setTab} className="tp-tabs two-up" items={[
        { value: 'products', label: 'Products', count: value.products.length },
        { value: 'brands', label: 'Brands', count: value.brands.length },
        { value: 'categories', label: 'Categories', count: value.categories.length },
        { value: 'store', label: 'Entire store', led: value.entire_store ? 'green' : undefined },
      ]} />
      <p className={`tp-summary ${value.entire_store ? 'store' : ''}`}>
        <Icon name={value.entire_store ? 'home' : 'layers'} size={14} />
        <span><b>{targetsSummary(value)}</b>{eligible != null && (value.entire_store || value.products.length + value.brands.length + value.categories.length > 0) ? ` · ${num(eligible)} product${eligible === 1 ? '' : 's'} in the shop` : ''}</span>
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      {value.entire_store && tab !== 'store' && <p className="tp-hint"><Icon name="info" size={14} />Entire store is on: every published product is already included.</p>}
      {tab === 'products' && <ProductsTab value={value} onChange={onChange} />}
      {tab === 'brands' && <BrandsTab value={value} onChange={onChange} brands={brands} counts={counts} />}
      {tab === 'categories' && <CategoriesTab value={value} onChange={onChange} categories={categories} counts={counts} />}
      {tab === 'store' && <StoreTab value={value} onChange={onChange} eligible={eligible} />}
      {value.products.length + value.brands.length + value.categories.length > 0 && !value.entire_store && (
        <Button size="sm" variant="quiet" icon="close" className="tp-reset" onClick={() => onChange({ ...value, products: [], brands: [], categories: [] })}>Clear all choices</Button>
      )}
    </div>
  );
}
