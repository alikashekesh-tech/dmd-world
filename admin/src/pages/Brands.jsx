import { useMemo, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { money, num } from '../lib/format.js';
import { Button, Chip, Drawer, Empty, Field, Notice, PageHeader, SearchBox, SkeletonRows, Thumb, Toggle, useUi } from '../ui/kit.jsx';
import { ImageField } from './Categories.jsx';

/** Add or edit a brand. Its product lines are categories that belong to it (set on the Categories screen). */
function BrandForm({ brand, onClose }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !brand?.id;
  const [f, setF] = useState({ name: brand?.name || '', slug: brand?.slug || '', description: brand?.description || '', logo: brand?.logo_url || '', active: brand?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { name: f.name.trim(), slug: f.slug.trim() || null, description: f.description || null, logo_url: f.logo.trim() || null, is_active: f.active };
      const { data: r } = isNew ? await api.post('/brands', body) : await api.put(`/brands/${brand.id}`, body);
      changed('brands');
      toast(isNew ? `Added brand “${r.name}”` : `Saved “${r.name}”`);
      onClose();
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const archive = async () => {
    if (!(await confirm({ title: `Archive “${brand.name}”?`, text: 'Its page and product lines leave the shop. Its products stay in the catalog. You can restore it from the trash.', confirmLabel: 'Archive', danger: true }))) return;
    setBusy(true);
    try { await api.del(`/brands/${brand.id}`); changed('brands'); toast(`Archived “${brand.name}”`); onClose(); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <Drawer title={isNew ? 'Add brand' : 'Edit brand'} hud={isNew ? null : `ID ${brand.id} · ${num(brand.products_count)} products`} onClose={onClose}
      footer={<>
        {!isNew && <Button variant="danger" icon="trash" onClick={archive} disabled={busy} style={{ marginRight: 'auto' }}>Archive</Button>}
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" loading={busy} disabled={!f.name.trim()} onClick={save}>{isNew ? 'Add brand' : 'Save'}</Button>
      </>}>
      <form className="stack" onSubmit={save}>
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} autoFocus placeholder="e.g. Razer" /></Field>
        <Field label="Slug" hint="The web address part. Leave empty to generate it from the name."><input className="input mono" value={f.slug} onChange={set('slug')} placeholder="auto" /></Field>
        <Field label="Description"><textarea className="textarea" value={f.description} onChange={set('description')} /></Field>
        <ImageField label="Logo" value={f.logo} onChange={set('logo')} />
        <Toggle label="Shown in the shop" checked={f.active} onChange={set('active')} />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

/* Brands are their own records; ranked here by the last 90 days of paid sales. */
export default function Brands({ query }) {
  const { data, error } = useApi('/brands');
  const [q, setQ] = useState('');
  const all = useMemo(() => data?.data || [], [data]);
  const items = all.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.revenue_90d - a.revenue_90d || b.products_count - a.products_count);
  const max = Math.max(1, ...items.map((b) => b.revenue_90d));
  const editing = query.get('edit') ? all.find((b) => b.id === Number(query.get('edit'))) : null;
  const creating = !!query.get('new');
  const close = () => setQuery({ new: null, edit: null });

  return (
    <>
      <PageHeader hud={<><span className="led violet" />Catalog</>} title="Brands" text="Every brand the store carries, ranked by the last 90 days of sales."
        actions={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 1 })}>Add brand</Button>} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Find a brand" /><span className="grow" /><span className="muted mono" style={{ fontSize: 12 }}>{num(all.length)} brands</span></div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows /> : !items.length ? <Empty icon="badge" title={q ? 'No brands match' : 'No brands yet'} action={<Button icon="plus" onClick={() => setQuery({ new: 1 })}>Add brand</Button>}>Add the brands you sell; products and product lines can then belong to them.</Empty> : (
          <table className="table cards">
            <thead><tr><th className="shrink">#</th><th>Brand</th><th>Sales · 90 days</th><th className="right">Products</th><th className="shrink" /></tr></thead>
            <tbody>
              {items.map((b, i) => (
                <tr key={b.id} className="clickable" onClick={() => setQuery({ edit: b.id })}>
                  <td className="shrink mono muted" style={{ fontSize: 12, color: i === 0 && b.revenue_90d ? 'var(--amber)' : undefined }}>{String(i + 1).padStart(2, '0')}</td>
                  <td><div className="cell-main"><Thumb src={b.logo_url} /><div style={{ minWidth: 0 }}><b>{b.name} {!b.is_active && <Chip tone="muted">Hidden</Chip>}</b><small>{b.product_line_count ? `${b.product_line_count} product lines` : b.slug}</small></div></div></td>
                  <td data-label="Sales" style={{ minWidth: 180 }}>
                    <span className="row" style={{ justifyContent: 'space-between' }}><b className="num">{money(b.revenue_90d, true)}</b><span className="muted mono" style={{ fontSize: 11.5 }}>{num(b.units_90d)} sold</span></span>
                    <span className="bar violet"><i style={{ width: `${(b.revenue_90d / max) * 100}%`, animationDelay: `${i * 40}ms` }} /></span>
                  </td>
                  <td className="right" data-label="Products"><a className="linkish mono" href={`#/products?brand=${b.id}`} onClick={(e) => e.stopPropagation()}>{num(b.products_count)}</a></td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Button size="sm" variant="quiet" icon="box" title="View products" aria-label={`View ${b.name} products`} onClick={() => { location.hash = `#/products?brand=${b.id}`; }} />
                      <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${b.name}`} onClick={() => setQuery({ edit: b.id })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (editing || creating) && <BrandForm key={editing?.id || 'new'} brand={editing} onClose={close} />}
    </>
  );
}
