import { useMemo, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { num, stripHtml } from '../lib/format.js';
import { Button, Chip, Drawer, Empty, Field, Icon, Notice, PageHeader, SearchBox, SkeletonRows, Thumb, Toggle, useUi } from '../ui/kit.jsx';

/** Depth-first list of the category tree (for indented selects and the table). */
export function flatten(categories, { exclude = new Set(), open = null } = {}) {
  const kids = {};
  for (const c of categories) (kids[c.parent] ||= []).push(c);
  for (const k of Object.keys(kids)) kids[k].sort((a, b) => (a.menu_order - b.menu_order) || a.name.localeCompare(b.name));
  const out = [];
  const walk = (parent, depth) => {
    for (const c of kids[parent] || []) {
      if (exclude.has(c.id)) continue;
      const children = (kids[c.id] || []).length;
      out.push({ c, depth, children });
      if (!open || open.has(c.id)) walk(c.id, depth + 1);
    }
  };
  walk(0, 0);
  return out;
}
const descendantsOf = (categories, id) => {
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const c of categories) if (out.has(c.parent) && !out.has(c.id)) { out.add(c.id); grew = true; } }
  return out;
};
const pathOf = (byId, c) => { const parts = []; let x = c; let guard = 0; while (x && guard++ < 12) { parts.unshift(x.name); x = byId.get(x.parent); } return parts.join(' › '); };

/** Add or edit a category (or a brand: a category flagged as one). */
export function CategoryForm({ cat, categories, defaults = {}, onClose, noun = 'category' }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !cat?.id;
  const [f, setF] = useState(() => ({ name: cat?.name || '', slug: cat?.slug || '', parent: cat?.parent ?? defaults.parent ?? 0, description: stripHtml(cat?.description || ''), image: cat?.image || '', isBrand: cat?.isBrand ?? !!defaults.isBrand }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const options = useMemo(() => flatten(categories, { exclude: cat?.id ? descendantsOf(categories, cat.id) : new Set() }), [categories, cat]);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, parent: Number(f.parent) };
      const r = isNew ? await api.post('/categories', body) : await api.put(`/categories/${cat.id}`, body);
      changed('categories');
      toast(isNew ? `Added ${f.isBrand ? 'brand' : 'category'} “${r.name}”` : `Saved “${r.name}”`);
      onClose(r);
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const del = async () => {
    const ok = await confirm({
      title: `Delete “${cat.name}”?`,
      text: `WooCommerce has no trash for categories, so this is permanent. Its ${num(cat.count)} product${cat.count === 1 ? '' : 's'} stay in the catalog and just lose this ${noun}; any subcategories move up one level.`,
      confirmLabel: 'Delete permanently', danger: true, typeToConfirm: cat.name,
    });
    if (!ok) return;
    setBusy(true);
    try { await api.del(`/categories/${cat.id}?confirm=delete`); changed('categories'); toast(`Deleted “${cat.name}”`); onClose(null); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <Drawer title={isNew ? `Add ${noun}` : `Edit ${noun}`} hud={isNew ? null : `ID ${cat.id} · ${num(cat.count)} products`} onClose={() => onClose()}
      footer={<>
        {!isNew && <Button variant="danger" icon="trash" onClick={del} disabled={busy} style={{ marginRight: 'auto' }}>Delete</Button>}
        <Button variant="quiet" onClick={() => onClose()}>Cancel</Button>
        <Button variant="primary" icon="check" loading={busy} disabled={!f.name.trim()} onClick={save}>{isNew ? `Add ${noun}` : 'Save'}</Button>
      </>}>
      <form className="stack" onSubmit={save}>
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} autoFocus placeholder={noun === 'brand' ? 'e.g. Razer' : 'e.g. Gaming headsets'} /></Field>
        <Field label="Slug" hint="The web address part. Leave empty to generate it from the name."><input className="input mono" value={f.slug} onChange={set('slug')} placeholder="auto" /></Field>
        <Field label="Parent">
          <select className="select" value={f.parent} onChange={set('parent')}>
            <option value={0}>None (top level)</option>
            {options.map(({ c, depth }) => <option key={c.id} value={c.id}>{' '.repeat(depth)}{c.name}</option>)}
          </select>
        </Field>
        <Field label="Description" hint="Shown on the category page by most themes."><textarea className="textarea" value={f.description} onChange={set('description')} /></Field>
        <Field label="Image URL">
          <div className="row"><Thumb src={f.image} /><input className="input grow" value={f.image} onChange={set('image')} placeholder="https://…" /></div>
        </Field>
        <div className="surface surface-body stack" style={{ gap: 6 }}>
          <Toggle label="This is a brand" checked={f.isBrand} onChange={set('isBrand')} />
          <span className="muted" style={{ fontSize: 12.5 }}>The store files products under brand categories (Sony, Razer…). Brands get their own page and sales report here.</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

export default function Categories({ query }) {
  const { data, error } = useApi('/categories');
  const all = useMemo(() => data?.items || [], [data]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const editing = query.get('edit') ? all.find((c) => c.id === Number(query.get('edit'))) : null;
  const creating = query.get('new') ? { parent: Number(query.get('parent') || 0) } : null;
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const s = q.trim().toLowerCase();
  const rows = useMemo(() => (s
    ? all.filter((c) => c.name.toLowerCase().includes(s) || c.slug.includes(s)).map((c) => ({ c, depth: 0, children: 0, path: pathOf(byId, byId.get(c.parent)) }))
    : flatten(all, { open })), [all, s, open, byId]);
  const parents = all.filter((c) => all.some((x) => x.parent === c.id)).map((c) => c.id);
  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const close = () => setQuery({ new: null, edit: null, parent: null });

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Catalog</>} title="Categories" text="How the shop is organised. Top-level order is set on the Homepage screen."
        actions={<><Button variant="quiet" icon="home" onClick={() => { location.hash = '#/homepage'; }}>Order on homepage</Button><Button variant="primary" icon="plus" onClick={() => setQuery({ new: 1 })}>Add category</Button></>} />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Find a category" />
        {!s && <Button variant="quiet" size="sm" icon={open.size ? 'up' : 'down'} onClick={() => setOpen(open.size ? new Set() : new Set(parents))}>{open.size ? 'Collapse all' : 'Expand all'}</Button>}
        <span className="grow" />
        <span className="muted mono" style={{ fontSize: 12 }}>{num(all.length)} categories · {num(all.filter((c) => c.isBrand).length)} brands</span>
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows /> : !rows.length ? <Empty icon="folder" title="No categories match">Try another name.</Empty> : (
          <table className="table cards">
            <thead><tr><th>Name</th><th className="right">Products</th><th>Slug</th><th className="shrink" /></tr></thead>
            <tbody>
              {rows.map(({ c, depth, children, path }) => (
                <tr key={c.id} className="clickable" onClick={() => setQuery({ edit: c.id })}>
                  <td>
                    <div className="cell-main" style={{ paddingLeft: depth * 22 }}>
                      {children > 0 ? (
                        <button type="button" className="btn sm quiet icon" aria-label={open.has(c.id) ? 'Collapse' : 'Expand'} aria-expanded={open.has(c.id)} onClick={(e) => { e.stopPropagation(); toggle(c.id); }}>
                          <Icon name="chevron" style={{ transform: open.has(c.id) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                      ) : <span style={{ width: 30, flex: 'none' }} />}
                      <Thumb src={c.image} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <b>{c.name} {c.isBrand && <Chip tone="violet">Brand</Chip>}</b>
                        <small>{path ? `in ${path}` : children ? `${children} subcategor${children === 1 ? 'y' : 'ies'}` : depth === 0 ? 'Top level' : ''}</small>
                      </div>
                    </div>
                  </td>
                  <td className="right" data-label="Products"><a className="linkish mono" href={`#/products?category=${c.id}`} onClick={(e) => e.stopPropagation()}>{num(c.count)}</a></td>
                  <td data-label="Slug" className="muted mono" style={{ fontSize: 12 }}>{c.slug}</td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Button size="sm" variant="quiet" icon="plus" title="Add subcategory" aria-label={`Add a subcategory to ${c.name}`} onClick={() => setQuery({ new: 1, parent: c.id })} />
                      <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${c.name}`} onClick={() => setQuery({ edit: c.id })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (editing || creating) && <CategoryForm key={editing?.id || 'new'} cat={editing} defaults={creating || {}} categories={all} onClose={close} />}
    </>
  );
}
