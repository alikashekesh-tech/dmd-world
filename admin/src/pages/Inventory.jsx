import { useEffect, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { money, num } from '../lib/format.js';
import { Button, Empty, Hp, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const LEVELS = [['all', 'All'], ['out', 'Out of stock', 'coral'], ['low', 'Running low', 'amber'], ['ok', 'In stock', 'green'], ['untracked', 'Not tracked']];

function InvRow({ p: initial, thresholds, focus }) {
  const { toast, fail } = useUi();
  const [p, setP] = useState(initial);
  const [qty, setQty] = useState(String(initial.stock_quantity ?? 0));
  const [low, setLow] = useState(initial.low_stock_amount == null ? '' : String(initial.low_stock_amount));
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setP(initial); setQty(String(initial.stock_quantity ?? 0)); setLow(initial.low_stock_amount == null ? '' : String(initial.low_stock_amount)); }, [initial]);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focus]);
  const tracked = p.manage_stock;
  const dirty = tracked && (qty !== String(p.stock_quantity ?? 0) || low !== (p.low_stock_amount == null ? '' : String(p.low_stock_amount)));
  const put = async (body, msg) => {
    setBusy(true);
    try { const r = await api.put(`/inventory/${p.id}`, body); setP((x) => ({ ...x, ...r })); toast(msg(r)); changed('stock'); } catch (e) { fail(e); }
    setBusy(false);
  };
  const save = (e) => { e?.preventDefault(); if (!dirty || qty === '') return; put({ stock_quantity: Number(qty), low_stock_amount: low === '' ? null : Number(low) }, (r) => `${r.name}: ${r.stock_quantity} in stock`); };
  const bump = (d) => setQty((v) => String(Math.max(0, (Number(v) || 0) + d)));
  return (
    <tr ref={ref} className={focus ? 'focus' : ''}>
      <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b><a href={`#/products/${p.id}`}>{p.name}</a></b><small>{p.sku ? `SKU ${p.sku}` : `ID ${p.id}`} · {money(p.price)}{p.status !== 'publish' ? ` · ${p.status}` : ''}</small>{p.waiting > 0 && <small className="waiting" title="Buyers who asked to be emailed when it's back in stock. Restocking emails them automatically.">{p.waiting} buyer{p.waiting === 1 ? '' : 's'} waiting for it</small>}</div></div></td>
      <td data-label="Health"><Hp qty={p.stock_quantity} level={p.level} scale={Math.max(20, (p.low_stock_amount ?? thresholds.lowStock) * 6)} /></td>
      <td data-label="Stock">
        {tracked ? (
          <form className="row" style={{ gap: 4 }} onSubmit={save}>
            <Button size="sm" variant="quiet" icon="minus" aria-label="One less" onClick={() => bump(-1)} />
            <input className="input mono" style={{ width: 70, height: 32, textAlign: 'center' }} type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Stock for ${p.name}`} />
            <Button size="sm" variant="quiet" icon="plus" aria-label="One more" onClick={() => bump(1)} />
          </form>
        ) : (
          <select className="select" style={{ width: 150, height: 32 }} value={p.stock_status} disabled={busy} aria-label={`Availability of ${p.name}`}
            onChange={(e) => put({ stock_status: e.target.value }, (r) => `${r.name} is now ${r.stock_status === 'instock' ? 'in stock' : r.stock_status === 'outofstock' ? 'out of stock' : 'on backorder'}`)}>
            <option value="instock">In stock</option><option value="outofstock">Out of stock</option><option value="onbackorder">On backorder</option>
          </select>
        )}
      </td>
      <td data-label="Alert at">
        {tracked ? <input className="input mono" style={{ width: 84, height: 32 }} type="number" min="0" value={low} placeholder={`${thresholds.lowStock}`} title="Leave empty to use the store default" onChange={(e) => setLow(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(e)} aria-label="Low-stock alert at" /> : <span className="muted">—</span>}
      </td>
      <td data-label="Track"><Toggle checked={tracked} disabled={busy} onChange={(v) => put({ manage_stock: v }, (r) => (v ? `Tracking stock for ${r.name}` : `Stopped tracking stock for ${r.name}`))} /></td>
      <td className="shrink">
        <Button size="sm" variant={dirty ? 'primary' : 'quiet'} icon="check" loading={busy} disabled={!dirty} onClick={save}>Save</Button>
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
  const params = new URLSearchParams({ level, page: query.get('page') || '1' });
  if (query.get('q')) params.set('search', query.get('q'));
  const { data, error } = useApi(`/inventory?${params}`);
  const [pinned, setPinned] = useState(null);
  useEffect(() => {
    if (!focus || !data || data.items.some((p) => p.id === focus)) { setPinned(null); return; }
    api.get(`/products/${focus}`).then((full) => {
      const th = data.thresholds;
      const lv = full.stock_status === 'outofstock' ? 'out' : !full.manage_stock || full.stock_quantity == null ? 'untracked' : full.stock_quantity <= th.noStock ? 'out' : full.stock_quantity <= (full.low_stock_amount ?? th.lowStock) ? 'low' : 'ok';
      setPinned({ id: full.id, name: full.name, sku: full.sku, price: full.price, status: full.status, image: full.images?.[0]?.src || null, stock_quantity: full.stock_quantity, stock_status: full.stock_status, manage_stock: full.manage_stock, low_stock_amount: full.low_stock_amount, level: lv });
    }).catch(() => setPinned(null));
  }, [focus, data]);
  const c = data?.counts || {};

  return (
    <>
      <PageHeader hud={<><span className={`led ${c.out ? 'coral pulse' : c.low ? 'amber' : 'green'}`} />Catalog</>} title="Inventory"
        text={data ? `${num(c.out || 0)} out of stock, ${num(c.low || 0)} running low. Alerts start at ${data.thresholds.lowStock} units unless a product sets its own.${data.waitingTotal ? ` ${num(data.waitingTotal)} back-in-stock request${data.waitingTotal === 1 ? '' : 's'} from buyers: restocking emails them automatically.` : ''}` : 'Stock levels across the catalog.'} />
      <div className="toolbar">
        <Tabs label="Stock level" value={level} onChange={(v) => setQuery({ level: v === 'all' ? null : v, page: null, focus: null })} items={LEVELS.map(([v, l, led]) => ({ value: v, label: l, count: c[v], led: c[v] ? led : undefined }))} />
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
                {pinned && <InvRow key={`pin-${pinned.id}`} p={pinned} thresholds={data.thresholds} focus />}
                {data.items.map((p) => <InvRow key={p.id} p={p} thresholds={data.thresholds} focus={p.id === focus} />)}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="products" onPage={(n) => setQuery({ page: n, focus: null })} />}
      </div>
      {data && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Changes save to WooCommerce straight away. New orders keep adjusting stock on their own.</p>}
    </>
  );
}
