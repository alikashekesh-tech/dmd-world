import { useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { money, num } from '../lib/format.js';
import { Button, Empty, Icon, Notice, PageHeader, SearchBox, SkeletonRows, Thumb, Toggle, useUi } from '../ui/kit.jsx';
import { CategoryForm } from './Categories.jsx';

/* Brands are product categories flagged as brands (that is how the store files them). */
export default function Brands({ query }) {
  const { toast, fail } = useUi();
  const { data, error } = useApi('/brands');
  const cats = useApi('/categories');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const items = (data?.items || []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.revenue90 - a.revenue90 || b.count - a.count);
  const max = Math.max(1, ...items.map((b) => b.revenue90));
  const editing = query.get('edit') ? (cats.data?.items || []).find((c) => c.id === Number(query.get('edit'))) : null;
  const creating = query.get('new') ? { isBrand: true, parent: 0 } : null;
  const flag = async (c, isBrand) => {
    setBusy(c.id);
    try { await api.put(`/categories/${c.id}`, { isBrand }); changed('categories'); toast(isBrand ? `“${c.name}” is now a brand` : `“${c.name}” is no longer listed as a brand`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const close = () => setQuery({ new: null, edit: null });

  return (
    <>
      <PageHeader hud={<><span className="led violet" />Catalog</>} title="Brands" text="Every brand the store carries, ranked by the last 90 days of sales."
        actions={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 1 })}>Add brand</Button>} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Find a brand" /><span className="grow" /><span className="muted mono" style={{ fontSize: 12 }}>{num(data?.items?.length || 0)} brands</span></div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows /> : !items.length ? <Empty icon="badge" title={q ? 'No brands match' : 'No brands yet'} action={<Button icon="plus" onClick={() => setQuery({ new: 1 })}>Add brand</Button>}>Brands are categories flagged as brands. Add one, or flag an existing category below.</Empty> : (
          <table className="table cards">
            <thead><tr><th className="shrink">#</th><th>Brand</th><th>Sales · 90 days</th><th className="right">Products</th><th className="shrink" /></tr></thead>
            <tbody>
              {items.map((b, i) => (
                <tr key={b.id} className="clickable" onClick={() => setQuery({ edit: b.id })}>
                  <td className="shrink mono muted" style={{ fontSize: 12, color: i === 0 && b.revenue90 ? 'var(--amber)' : undefined }}>{String(i + 1).padStart(2, '0')}</td>
                  <td><div className="cell-main"><Thumb src={b.image} /><div style={{ minWidth: 0 }}><b>{b.name}</b><small>{b.children ? `${b.children} product lines` : b.slug}</small></div></div></td>
                  <td data-label="Sales" style={{ minWidth: 180 }}>
                    <span className="row" style={{ justifyContent: 'space-between' }}><b className="num">{money(b.revenue90, true)}</b><span className="muted mono" style={{ fontSize: 11.5 }}>{num(b.units90)} sold</span></span>
                    <span className="bar violet"><i style={{ width: `${(b.revenue90 / max) * 100}%`, animationDelay: `${i * 40}ms` }} /></span>
                  </td>
                  <td className="right" data-label="Products"><a className="linkish mono" href={`#/products?category=${b.id}`} onClick={(e) => e.stopPropagation()}>{num(b.count)}</a></td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Button size="sm" variant="quiet" icon="box" title="View products" aria-label={`View ${b.name} products`} onClick={() => { location.hash = `#/products?category=${b.id}`; }} />
                      <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${b.name}`} onClick={() => setQuery({ edit: b.id })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data?.candidates?.length > 0 && (
        <section className="surface" style={{ marginTop: 16 }}>
          <div className="surface-head"><div><h3>Other top-level categories</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Flag one as a brand if it is really a brand. Nothing changes in the shop; it only changes how sales are grouped here.</p></div></div>
          <ul className="ledger">
            {data.candidates.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <li key={c.id} className="mini-row">
                <Icon name="folder" size={16} className="muted" />
                <span className="grow">{c.name} <span className="muted mono" style={{ fontSize: 11.5 }}>· {num(c.count)} products</span></span>
                <Toggle label="Brand" checked={false} disabled={busy === c.id} onChange={() => flag(c, true)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {cats.data && (editing || creating) && (
        <CategoryForm key={editing?.id || 'new'} noun="brand" cat={editing} defaults={creating || {}} categories={cats.data.items} onClose={close} />
      )}
    </>
  );
}
