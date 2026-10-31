import { useEffect, useMemo, useState } from 'react';
import { api, changed } from '../../lib/api.js';
import { useDebounced } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { Button, Chip, Icon, Notice, SearchBox, Thumb, useUi } from '../../ui/kit.jsx';

const MAX = { product: 12, category: 8 };

/** Search box with a result menu: products from the API, categories filtered locally. */
function Finder({ type, categories, exclude, onPick, full }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [remote, setRemote] = useState([]);
  useEffect(() => {
    let live = true;
    if (type !== 'product' || dq.trim().length < 2) { setRemote([]); return undefined; }
    api.get(`/products?q=${encodeURIComponent(dq)}&per_page=8`).then((r) => { if (live) setRemote(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [dq, type]);
  const s = q.trim().toLowerCase();
  const results = type === 'product' ? remote
    : s ? categories.filter((c) => (c.label || c.name).toLowerCase().includes(s)).slice(0, 10) : [];
  const pick = (x) => { onPick(x); setQ(''); };
  return (
    <div style={{ position: 'relative' }}>
      <SearchBox value={q} onChange={setQ} placeholder={full ? 'The list is full: remove one to add another' : type === 'product' ? 'Search a product to add…' : 'Search a category to add…'} />
      {results.length > 0 && !full && (
        <div className="menu" style={{ left: 0, right: 0, maxHeight: 300, overflowY: 'auto' }}>
          {results.map((x) => (
            <button key={x.id} type="button" disabled={exclude.includes(x.id)} onClick={() => pick(x)}>
              {type === 'product' && <Thumb src={x.image} size="sm" />}
              <span className="grow clamp1">{x.label || x.name}</span>
              {exclude.includes(x.id) ? <Chip tone="green">Added</Chip> : <span className="mono muted">{type === 'product' ? money(x.price) : `${x.count ?? 0} products`}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hand-picked items for a section (products for Weekly Offers, categories for Beyond the console), in order. */
export default function Picks({ section, title, categories, onSaved }) {
  const { toast, fail } = useUi();
  const type = section.picks;
  const initial = useMemo(() => section.items.map((i) => i.id), [section]);
  const [ids, setIds] = useState(initial);
  const [meta, setMeta] = useState({});
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setIds(initial), [initial]);
  useEffect(() => {
    setMeta((m) => ({ ...Object.fromEntries(section.items.map((i) => [i.id, { name: i.name, live: i.on_storefront }])), ...m }));
  }, [section]);
  // Product thumbnails and prices.
  useEffect(() => {
    if (type !== 'product') return;
    const missing = ids.filter((id) => !meta[id]?.loaded);
    if (!missing.length) return;
    Promise.all(missing.slice(0, 20).map((id) => api.get(`/products/${id}`).then(({ data: p }) => [id, { name: p.name, image: p.image, price: p.price, loaded: true, live: meta[id]?.live ?? true }]).catch(() => [id, { ...meta[id], loaded: true }])))
      .then((pairs) => setMeta((m) => ({ ...m, ...Object.fromEntries(pairs) })));
  }, [ids, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const name = (id) => (type === 'category' ? byId[id]?.label || byId[id]?.name : null) || meta[id]?.name || `#${id}`;
  const dirty = ids.join() !== initial.join();
  const full = ids.length >= MAX[type];
  const move = (from, to) => setIds((l) => { if (to < 0 || to >= l.length) return l; const a = [...l]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  const add = (x) => { if (ids.includes(x.id) || full) return; setMeta((m) => ({ ...m, [x.id]: { name: x.label || x.name, image: x.image, price: x.price, loaded: type === 'product', live: true } })); setIds((l) => [...l, x.id]); };
  const save = async () => {
    setBusy(true);
    try { await api.put(`/homepage/sections/${section.key}/items`, { ids }); changed('homepage'); toast(ids.length ? 'Picks saved' : 'Back to choosing automatically'); onSaved(); } catch (e) { fail(e); }
    setBusy(false);
  };
  const stale = ids.some((id) => meta[id]?.live === false);

  return (
    <section className="surface">
      <div className="surface-head hp-head">
        <div className="grow">
          <h3>{title}</h3>
          <p className="hp-desc">{type === 'product'
            ? `Choose up to ${MAX.product} discounted products and the order they appear in. A product shows while it is discounted. Leave the list empty and the deepest discounts are shown automatically.`
            : `Choose up to ${MAX.category} categories for the grid, in order. Built-in tiles fill any places left. Leave it empty to use the built-in tiles.`}</p>
        </div>
        <Chip tone={ids.length ? 'blue' : 'muted'}>{ids.length ? `${ids.length} / ${MAX[type]} picked` : 'Automatic'}</Chip>
      </div>
      <div className="surface-body stack">
        <Finder type={type} categories={categories} exclude={ids} onPick={add} full={full} />
        {ids.length ? (
          <ol className="pick-list">
            {ids.map((id, i) => (
              <li key={id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)} className={drag === i ? 'dragging' : ''}>
                <Icon name="grip" size={15} className="muted grip" />
                <span className="pick-n mono">{i + 1}</span>
                {type === 'product' ? <Thumb src={meta[id]?.image} size="sm" /> : <span className="thumb sm none"><Icon name="folder" /></span>}
                <span className="grow" style={{ minWidth: 0 }}>
                  <b className="clamp1">{name(id)}</b>
                  <small className="muted">{type === 'product' ? (meta[id]?.price != null ? money(meta[id].price) : ' ') : `${byId[id]?.count ?? 0} products`}{meta[id]?.live === false && <span style={{ color: 'var(--amber)' }}> · not on the storefront, skipped</span>}</small>
                </span>
                <Button size="sm" variant="quiet" icon="up" aria-label={`Move ${name(id)} up`} disabled={i === 0} onClick={() => move(i, i - 1)} />
                <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${name(id)} down`} disabled={i === ids.length - 1} onClick={() => move(i, i + 1)} />
                <Button size="sm" variant="quiet" icon="close" aria-label={`Remove ${name(id)}`} onClick={() => setIds((l) => l.filter((x) => x !== id))} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="pick-empty"><Icon name="sparkle" size={18} /><span>Automatic: {type === 'product' ? 'the deepest discounts are shown.' : 'the built-in tiles are shown.'} Search above to choose your own.</span></div>
        )}
        {stale && <Notice tone="amber" icon="alert">Some picks aren’t on the storefront any more; they are skipped.</Notice>}
        {dirty && (
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="quiet" onClick={() => setIds(initial)}>Reset</Button>
            <Button variant="primary" icon="check" loading={busy} onClick={save}>Save picks</Button>
          </div>
        )}
      </div>
    </section>
  );
}
