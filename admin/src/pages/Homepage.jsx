import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { money, num, safeHref } from '../lib/format.js';
import { Button, Chip, Icon, Notice, PageHeader, SearchBox, SkeletonRows, Thumb, useUi } from '../ui/kit.jsx';

/** Search the catalog and pick one product. */
function AddProduct({ onPick, exclude = [], placeholder }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [res, setRes] = useState([]);
  useEffect(() => {
    let live = true;
    if (dq.trim().length < 2) { setRes([]); return undefined; }
    api.get(`/products?search=${encodeURIComponent(dq)}&status=publish&per=8`).then((r) => live && setRes(r.items)).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  return (
    <div style={{ position: 'relative' }}>
      <SearchBox value={q} onChange={setQ} placeholder={placeholder} />
      {res.length > 0 && (
        <div className="menu" style={{ left: 0, right: 0, maxHeight: 300, overflowY: 'auto' }}>
          {res.map((p) => (
            <button key={p.id} type="button" disabled={exclude.includes(p.id)} onClick={() => { onPick(p); setQ(''); setRes([]); }}>
              <Thumb src={p.image} size="sm" /><span className="grow clamp1">{p.name}</span>
              {exclude.includes(p.id) ? <Icon name="check" /> : <span className="mono muted">{money(p.price)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Shelf({ items, onRemove, busy, empty }) {
  if (!items.length) return <p className="muted" style={{ padding: '4px 2px', fontSize: 13 }}>{empty}</p>;
  return (
    <ul className="shelf">
      {items.map((p) => (
        <li key={p.id}>
          <a href={`#/products/${p.id}`}><Thumb src={p.image} size="lg" /></a>
          <a href={`#/products/${p.id}`} className="clamp1" style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</a>
          <span className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
            <span className="mono" style={{ fontSize: 12 }}>{p.on_sale ? <><b style={{ color: 'var(--coral)' }}>{money(p.price)}</b> <del className="muted">{money(p.regular_price)}</del></> : money(p.price)}</span>
            {onRemove && <Button size="sm" variant="quiet" icon="close" loading={busy === p.id} aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Homepage({ session }) {
  const { toast, fail } = useUi();
  const { data, error, setData } = useApi('/homepage');
  const [busy, setBusy] = useState(null);
  const [order, setOrder] = useState(null);
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const newOffers = data?.categories.find((c) => c.slug === 'new-offers');
  const shelf = useApi(newOffers ? `/products?category=${newOffers.id}&status=publish&per=24&sort=updated` : null);
  useEffect(() => { if (data) setOrder(data.categories); }, [data]);

  const feature = async (p, on) => {
    setBusy(p.id);
    try {
      await api.put(`/products/${p.id}`, { featured: on });
      setData((d) => ({ ...d, featured: on ? [...d.featured, p] : d.featured.filter((x) => x.id !== p.id) }));
      changed('products');
      toast(on ? `“${p.name}” is featured on the homepage` : `“${p.name}” is no longer featured`, { undo: async () => { await api.put(`/products/${p.id}`, { featured: !on }).catch(fail); changed('products'); } });
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const shelfToggle = async (p, add) => {
    setBusy(p.id);
    try {
      const full = await api.get(`/products/${p.id}`);
      const ids = full.categories.map((c) => c.id).filter((id) => id !== newOffers.id);
      await api.put(`/products/${p.id}`, { categories: add ? [...ids, newOffers.id] : ids });
      changed('products');
      toast(add ? `Added “${p.name}” to ${newOffers.name}` : `Removed “${p.name}” from ${newOffers.name}`);
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const move = (from, to) => setOrder((list) => { if (to < 0 || to >= list.length) return list; const a = [...list]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  const orderDirty = order && data && order.map((c) => c.id).join() !== data.categories.map((c) => c.id).join();
  const saveOrder = async () => {
    setSaving(true);
    try { await api.post('/categories/order', { ids: order.map((c) => c.id) }); changed('categories'); setData((d) => ({ ...d, categories: order })); toast('Category order saved'); } catch (e) { fail(e); }
    setSaving(false);
  };

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Site</>} title="Homepage" text="Everything on the store’s homepage that WooCommerce controls: featured products, sale items, best sellers and the order of category sections." />
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}

      <section className="surface hero-card">
        <div className="surface-body row wrap" style={{ gap: 16, alignItems: 'center' }}>
          <span className="q-ic" style={{ width: 44, height: 44 }}><Icon name="image" size={20} /></span>
          <div className="grow" style={{ minWidth: 240 }}>
            <h3 style={{ fontSize: 16 }}>Hero slider & promo banners</h3>
            <p className="t2" style={{ fontSize: 13, marginTop: 4 }}>These are designed in Elementor, WordPress’s page builder. WooCommerce’s API can’t edit them, so they open in the builder instead.</p>
          </div>
          {safeHref(data?.builderUrl || session.capabilities.wpAdmin)
            ? <a className="btn primary" href={safeHref(data?.builderUrl || session.capabilities.wpAdmin)} target="_blank" rel="noopener noreferrer"><Icon name="external" />Open page builder</a>
            : <Chip tone="amber">Not available on the test emulator</Chip>}
        </div>
      </section>

      {!data ? <div className="surface" style={{ marginTop: 16 }}><SkeletonRows /></div> : (
        <div className="split" style={{ marginTop: 16 }}>
          <div className="stack">
            <section className="surface">
              <div className="surface-head"><div><h3>Featured products</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>The homepage’s featured block shows these.</p></div><Chip tone="blue">{num(data.featured.length)}</Chip></div>
              <div className="surface-body stack">
                <AddProduct placeholder="Search a product to feature…" exclude={data.featured.map((p) => p.id)} onPick={(p) => feature(p, true)} />
                <Shelf items={data.featured} busy={busy} onRemove={(p) => feature(p, false)} empty="Nothing is featured yet. Pick a few best sellers or new arrivals." />
              </div>
            </section>

            {newOffers && (
              <section className="surface">
                <div className="surface-head"><div><h3>{newOffers.name}</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>The homepage’s new-offers row lists products in this category.</p></div><Chip tone="coral">{num(shelf.data?.total ?? newOffers.count)}</Chip></div>
                <div className="surface-body stack">
                  <AddProduct placeholder={`Add a product to ${newOffers.name}…`} exclude={(shelf.data?.items || []).map((p) => p.id)} onPick={(p) => shelfToggle(p, true)} />
                  {shelf.data ? <Shelf items={shelf.data.items} busy={busy} onRemove={(p) => shelfToggle(p, false)} empty="This row is empty." /> : <SkeletonRows rows={2} />}
                </div>
              </section>
            )}

            <section className="surface">
              <div className="surface-head"><div><h3>On sale now</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Shown automatically wherever the theme lists sale items.</p></div><a className="btn sm" href="#/offers?tab=sales">Manage offers<Icon name="arrow" /></a></div>
              <div className="surface-body"><Shelf items={data.onSale} empty="Nothing is on sale. Create an offer to fill this row." /></div>
            </section>

            <section className="surface">
              <div className="surface-head"><div><h3>Best sellers · 30 days</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Worked out from real orders. Feature or discount them to push them harder.</p></div></div>
              <ol className="ledger">
                {data.bestSellers.map((p, i) => (
                  <li key={p.id}>
                    <a className="lb" href={`#/products/${p.id}`}>
                      <span className="rk">{String(i + 1).padStart(2, '0')}</span><Thumb src={p.image} size="sm" />
                      <b className="clamp1">{p.name}</b>
                      <span className="lb-v"><b className="num">{num(p.units)} sold</b><small>{money(p.revenue, true)}</small></span>
                    </a>
                  </li>
                ))}
                {!data.bestSellers.length && <li className="muted" style={{ padding: 16 }}>No paid orders in the last 30 days.</li>}
              </ol>
            </section>
          </div>

          <aside className="stack sticky-col">
            <section className="surface">
              <div className="surface-head"><div><h3>Category order</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Menus and category sections follow this order.</p></div></div>
              <ul className="order-list">
                {(order || []).map((c, i) => (
                  <li key={c.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)} className={drag === i ? 'dragging' : ''}>
                    <Icon name="grip" size={15} className="muted grip" />
                    <span className="mono muted" style={{ fontSize: 11, width: 18 }}>{i + 1}</span>
                    <span className="grow clamp1">{c.name}{c.isBrand && <span className="muted" style={{ fontSize: 11 }}> · brand</span>}</span>
                    <Button size="sm" variant="quiet" icon="up" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} />
                    <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${c.name} down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)} />
                  </li>
                ))}
              </ul>
              {orderDirty && (
                <div className="drawer-foot" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
                  <Button variant="quiet" onClick={() => setOrder(data.categories)}>Reset</Button>
                  <Button variant="primary" icon="check" loading={saving} onClick={saveOrder}>Save order</Button>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
