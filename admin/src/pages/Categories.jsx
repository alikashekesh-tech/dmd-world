import { useMemo, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { num } from '../lib/format.js';
import { categoryFromApi } from '../lib/catalog.js';
import { Button, Chip, Drawer, Empty, Field, Icon, Notice, PageHeader, SearchBox, SkeletonRows, Thumb, Toggle, useUi } from '../ui/kit.jsx';

/** Depth-first list of the category tree, in the owner's order (for indented selects and the table). */
export function flatten(categories, { exclude = new Set(), open = null } = {}) {
  const kids = {};
  for (const c of categories) (kids[c.parent] ||= []).push(c);
  for (const k of Object.keys(kids)) kids[k].sort((a, b) => (a.position - b.position) || a.label.localeCompare(b.label));
  const out = [];
  const walk = (parent, depth) => {
    for (const c of kids[parent] || []) {
      if (exclude.has(c.id)) continue;
      const children = (kids[c.id] || []).length;
      out.push({ c, depth, children, siblings: kids[parent] });
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
const pathOf = (byId, c) => { const parts = []; let x = c; let guard = 0; while (x && guard++ < 12) { parts.unshift(x.label); x = byId.get(x.parent); } return parts.join(' › '); };

/** An image field: an upload or an https address. */
export function ImageField({ label = 'Image', value, onChange }) {
  const { fail } = useUi();
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    try { onChange((await api.upload(f)).url); } catch (e) { fail(e); }
    setBusy(false);
  };
  return (
    <Field label={label} hint="Upload a JPEG, PNG, WebP or GIF, or paste an https:// address.">
      <div className="row">
        <Thumb src={value} />
        <input className="input grow" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button icon="upload" loading={busy} onClick={() => file.current?.click()}>Upload</Button>
      </div>
    </Field>
  );
}

/** Add or edit a category. A top-level category can be a brand's product line. */
export function CategoryForm({ cat, categories, brands, defaults = {}, onClose }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !cat?.id;
  const [f, setF] = useState(() => ({
    name: cat?.name || '', slug: cat?.slug || '', parent: cat?.parent ?? defaults.parent ?? 0, brand: cat?.brandId ?? defaults.brand ?? '',
    description: cat?.description || '', image: cat?.image || '', visible: cat?.isVisible ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const options = useMemo(() => flatten(categories, { exclude: cat?.id ? descendantsOf(categories, cat.id) : new Set() }), [categories, cat]);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const parent = Number(f.parent) || null;
      const body = { name: f.name.trim(), slug: f.slug.trim() || null, parent_id: parent, brand_id: parent ? null : (Number(f.brand) || null), description: f.description || null, image_url: f.image.trim() || null, is_visible: f.visible };
      const { data: r } = isNew ? await api.post('/categories', body) : await api.put(`/categories/${cat.id}`, body);
      changed('categories');
      toast(isNew ? `Added “${r.name}”` : `Saved “${r.name}”`);
      onClose(r);
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const archive = async () => {
    const ok = await confirm({
      title: `Archive “${cat.name}”?`,
      text: `It leaves the shop together with everything below it. Its ${num(cat.count)} product${cat.count === 1 ? '' : 's'} stay in the catalog. You can restore it from the trash.`,
      confirmLabel: 'Archive', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await api.del(`/categories/${cat.id}`); changed('categories'); toast(`Archived “${cat.name}”`); onClose(null); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <Drawer title={isNew ? 'Add category' : 'Edit category'} hud={isNew ? null : `ID ${cat.id} · ${num(cat.count)} products`} onClose={() => onClose()}
      footer={<>
        {!isNew && <Button variant="danger" icon="trash" onClick={archive} disabled={busy} style={{ marginRight: 'auto' }}>Archive</Button>}
        <Button variant="quiet" onClick={() => onClose()}>Cancel</Button>
        <Button variant="primary" icon="check" loading={busy} disabled={!f.name.trim()} onClick={save}>{isNew ? 'Add category' : 'Save'}</Button>
      </>}>
      <form className="stack" onSubmit={save}>
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} autoFocus placeholder="e.g. Gaming headsets" /></Field>
        <Field label="Slug" hint="The web address part. Leave empty to generate it from the name."><input className="input mono" value={f.slug} onChange={set('slug')} placeholder="auto" /></Field>
        <Field label="Parent">
          <select className="select" value={f.parent} onChange={set('parent')}>
            <option value={0}>None (top level)</option>
            {options.map(({ c, depth }) => <option key={c.id} value={c.id}>{' '.repeat(depth)}{c.label}</option>)}
          </select>
        </Field>
        {!Number(f.parent) && (
          <Field label="Brand" hint="A top-level category can be one of a brand’s product lines (Razer · Mouse). It then shows on the brand’s page.">
            <select className="select" value={f.brand} onChange={set('brand')}>
              <option value="">No brand</option>
              {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Description" hint="Shown on the category page."><textarea className="textarea" value={f.description} onChange={set('description')} /></Field>
        <ImageField value={f.image} onChange={set('image')} />
        <div className="surface surface-body stack" style={{ gap: 6 }}>
          <Toggle label="Shown in the shop" checked={f.visible} onChange={set('visible')} />
          <span className="muted" style={{ fontSize: 12.5 }}>Hiding a category also hides everything below it, without touching its products.</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

export default function Categories({ query }) {
  const { fail } = useUi();
  const { data, error } = useApi('/categories');
  const brandsApi = useApi('/brands', { live: false });
  const brands = useMemo(() => brandsApi.data?.data || [], [brandsApi.data]);
  const all = useMemo(() => (data?.data || []).map((c) => categoryFromApi(c, (id) => brands.find((b) => b.id === id)?.name)), [data, brands]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const editing = query.get('edit') ? all.find((c) => c.id === Number(query.get('edit'))) : null;
  const creating = query.get('new') ? { parent: Number(query.get('parent') || 0) } : null;
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const s = q.trim().toLowerCase();
  const rows = useMemo(() => (s
    ? all.filter((c) => c.label.toLowerCase().includes(s) || c.slug.includes(s)).map((c) => ({ c, depth: 0, children: 0, path: pathOf(byId, byId.get(c.parent)) }))
    : flatten(all, { open })), [all, s, open, byId]);
  const parents = all.filter((c) => all.some((x) => x.parent === c.id)).map((c) => c.id);
  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const close = () => setQuery({ new: null, edit: null, parent: null });
  const move = async (row, d) => {
    const list = row.siblings.map((x) => x.id);
    const i = list.indexOf(row.c.id);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try { await api.post('/categories/reorder', { ids: list }); changed('categories'); } catch (e) { fail(e); }
  };

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Catalog</>} title="Categories" text="How the shop is organised. Menus follow this order."
        actions={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 1 })}>Add category</Button>} />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Find a category" />
        {!s && <Button variant="quiet" size="sm" icon={open.size ? 'up' : 'down'} onClick={() => setOpen(open.size ? new Set() : new Set(parents))}>{open.size ? 'Collapse all' : 'Expand all'}</Button>}
        <span className="grow" />
        <span className="muted mono" style={{ fontSize: 12 }}>{num(all.length)} categories · {num(data?.meta?.archived || 0)} archived</span>
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows /> : !rows.length ? <Empty icon="folder" title="No categories match">Try another name.</Empty> : (
          <table className="table cards">
            <thead><tr><th>Name</th><th className="right">Products</th><th>Slug</th><th className="shrink" /></tr></thead>
            <tbody>
              {rows.map((row) => {
                const { c, depth, children, path } = row;
                return (
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
                          <b>{c.name} {c.brandName && !c.parent && <Chip tone="violet">{c.brandName}</Chip>}{!c.isVisible && <Chip tone="muted">Hidden</Chip>}</b>
                          <small>{path ? `in ${path}` : children ? `${children} subcategor${children === 1 ? 'y' : 'ies'}` : depth === 0 ? 'Top level' : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td className="right" data-label="Products"><a className="linkish mono" href={`#/products?category=${c.id}`} onClick={(e) => e.stopPropagation()}>{num(c.count)}</a></td>
                    <td data-label="Slug" className="muted mono" style={{ fontSize: 12 }}>{c.slug}</td>
                    <td className="shrink" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        {!s && <><Button size="sm" variant="quiet" icon="up" aria-label={`Move ${c.name} up`} disabled={row.siblings[0] === c} onClick={() => move(row, -1)} />
                          <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${c.name} down`} disabled={row.siblings[row.siblings.length - 1] === c} onClick={() => move(row, 1)} /></>}
                        <Button size="sm" variant="quiet" icon="plus" title="Add subcategory" aria-label={`Add a subcategory to ${c.name}`} onClick={() => setQuery({ new: 1, parent: c.id })} />
                        <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${c.name}`} onClick={() => setQuery({ edit: c.id })} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {data && (editing || creating) && <CategoryForm key={editing?.id || 'new'} cat={editing} defaults={creating || {}} categories={all} brands={brands} onClose={close} />}
    </>
  );
}
