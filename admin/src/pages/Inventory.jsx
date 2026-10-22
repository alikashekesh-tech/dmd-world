import { useEffect, useMemo, useRef, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { money, num } from '../lib/format.js';
import { productFromApi } from '../lib/catalog.js';
import { Button, Empty, Hp, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const LEVELS = [['all', 'All'], ['out', 'Out of stock', 'coral'], ['low', 'Running low', 'amber'], ['in', 'In stock', 'green'], ['untracked', 'Not tracked']];

/* Every change is recorded in the product's stock history (who, when, by how much). */
function InvRow({ p: initial, focus }) {
  const { toast, fail } = useUi();
  const [p, setP] = useState(initial);
  const [qty, setQty] = useState(String(initial.stock_quantity ?? 0));
  const [low, setLow] = useState(initial.low_stock_threshold == null ? '' : String(initial.low_stock_threshold));
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setP(initial); setQty(String(initial.stock_quantity ?? 0)); setLow(initial.low_stock_threshold == null ? '' : String(initial.low_stock_threshold)); }, [initial]);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focus]);
  const tracked = p.track_stock;
  const qtyDirty = tracked && qty !== String(p.stock_quantity ?? 0);
  const lowDirty = tracked && low !== (p.low_stock_threshold == null ? '' : String(p.low_stock_threshold));
  const put = async (body, msg) => {
    setBusy(true);
    try { const { data } = await api.put(`/inventory/${p.id}`, body); const r = productFromApi(data); setP((x) => ({ ...r, waiting: x.waiting })); toast(msg(r)); changed('stock'); } catch (e) { fail(e); }
    setBusy(false);
  };
  const save = (e) => {
    e?.preventDefault();
    if ((!qtyDirty && !lowDirty) || qty === '') return;
    put({ ...(qtyDirty ? { stock_quantity: Number(qty) } : {}), ...(lowDirty ? { low_stock_threshold: low === '' ? null : Number(low) } : {}) }, (r) => `${r.name}: ${r.stock_quantity} in stock`);
  };
  const bump = (d) => setQty((v) => String(Math.max(0, (Number(v) || 0) + d)));
  return (
    <tr ref={ref} className={focus ? 'focus' : ''}>
      <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b><a href={`#/products/${p.id}`}>{p.name}</a></b><small>{p.sku ? `SKU ${p.sku}` : `ID ${p.id}`} · {money(p.price)}{p.status !== 'published' ? ` · ${p.status}` : ''}</small>{p.waiting > 0 && <small className="waiting" title="Buyers who asked to be emailed when it's back in stock. Restocking emails them automatically.">{p.waiting} buyer{p.waiting === 1 ? '' : 's'} waiting for it</small>}</div></div></td>
      <td data-label="Health"><Hp qty={p.stock_quantity} level={p.level} scale={Math.max(20, p.effective_low_stock_threshold * 6)} /></td>
      <td data-label="Stock">
        {tracked ? (
          <form className="row" style={{ gap: 4 }} onSubmit={save}>
            <Button size="sm" variant="quiet" icon="minus" aria-label="One less" onClick={() => bump(-1)} />
            <input className="input mono" style={{ width: 70, height: 32, textAlign: 'center' }} type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Stock for ${p.name}`} />
            <Button size="sm" variant="quiet" icon="plus" aria-label="One more" onClick={() => bump(1)} />
          </form>
        ) : (
          <select className="select" style={{ width: 150, height: 32 }} value={p.stock_status} disabled={busy} aria-label={`Availability of ${p.name}`}
            onChange={(e) => put({ stock_status: e.target.value }, (r) => `${r.name} is now ${r.stock_status === 'in_stock' ? 'in stock' : 'out of stock'}`)}>
            <option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option>
          </select>
        )}
      </td>
      <td data-label="Alert at">
        {tracked ? <input className="input mono" style={{ width: 84, height: 32 }} type="number" min="0" value={low} placeholder={`${p.effective_low_stock_threshold}`} title="Leave empty to use the store default" onChange={(e) => setLow(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(e)} aria-label="Low-stock alert at" /> : <span className="muted">—</span>}
      </td>
      <td data-label="Track"><Toggle checked={tracked} disabled={busy} onChange={(v) => put({ track_stock: v }, (r) => (v ? `Tracking stock for ${r.name}` : `Stopped tracking stock for ${r.name}`))} /></td>
      <td className="shrink">
        <Button size="sm" variant={qtyDirty || lowDirty ? 'primary' : 'quiet'} icon="check" loading={busy} disabled={!qtyDirty && !lowDirty} onClick={save}>Save</Button>
      </td>
    </tr>
  );
}

export default function Inventory({ query }) {
  const level = query.get('level') || 'all';
  const focus = Number(query.get('focus') || 0);
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 250);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ page: query.get('page') || '1' });
  if (level !== 'all') params.set('level', level);
  if (query.get('q')) params.set('q', query.get('q'));
  const { data: raw, error } = useApi(`/inventory?${params}`);
  const data = useMemo(() => (raw ? paged(raw, productFromApi) : null), [raw]);
  const settings = useApi('/settings', { live: false });
  const [pinned, setPinned] = useState(null);
  useEffect(() => {
    if (!focus || !data || data.items.some((p) => p.id === focus)) { setPinned(null); return; }
    api.get(`/products/${focus}`).then((r) => setPinned(productFromApi(r.data))).catch(() => setPinned(null));
  }, [focus, data]);
  const c = raw?.meta?.counts || {};
  const waiting = (data?.items || []).reduce((a, p) => a + (p.waiting || 0), 0);
  const threshold = settings.data?.data?.low_stock_threshold;

  return (
    <>
      <PageHeader hud={<><span className={`led ${c.out ? 'coral pulse' : c.low ? 'amber' : 'green'}`} />Catalog</>} title="Inventory"
        text={data ? `${num(c.out || 0)} out of stock, ${num(c.low || 0)} running low.${threshold != null ? ` Alerts start at ${threshold} units unless a product sets its own.` : ''}${waiting ? ` ${num(waiting)} back-in-stock request${waiting === 1 ? '' : 's'} on this page: restocking emails those buyers automatically.` : ''}` : 'Stock levels across the catalog.'} />
      <div className="toolbar">
        <Tabs label="Stock level" value={level} onChange={(v) => setQuery({ level: v === 'all' ? null : v, page: null, focus: null })} items={LEVELS.map(([v, l, led]) => ({ value: v, label: l, count: v === 'all' ? undefined : c[v], led: c[v] ? led : undefined }))} />
      </div>
      <div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search by name or SKU" /></div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows /> : (!data.items.length && !pinned) ? (
          <Empty icon="layers" title={level === 'out' ? 'Nothing is out of stock' : level === 'low' ? 'Nothing is running low' : 'No products match'}>{level === 'out' || level === 'low' ? 'Every tracked product is above its alert level.' : 'Try another search.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Product</th><th>Health</th><th>In stock</th><th>Alert at</th><th>Track</th><th className="shrink" /></tr></thead>
              <tbody>
                {pinned && <InvRow key={`pin-${pinned.id}`} p={pinned} focus />}
                {data.items.map((p) => <InvRow key={p.id} p={p} focus={p.id === focus} />)}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="products" onPage={(n) => setQuery({ page: n, focus: null })} />}
      </div>
      {data && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Every change is recorded in the product’s stock history. Orders and cancellations adjust stock on their own.</p>}
    </>
  );
}
