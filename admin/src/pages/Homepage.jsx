import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { day, toInputDate, fromInputDate } from '../lib/format.js';
import { useCatalogLists } from '../lib/catalog.js';
import { Button, CategoryPicker, Chip, Drawer, Empty, Field, Icon, Notice, PageHeader, ProductPicker, SkeletonRows, Toggle, useUi } from '../ui/kit.jsx';
import { ImageField } from './Categories.jsx';

const SECTION = {
  hero: ['The desk', 'The opening scene: objects on the desk link to shop searches.'],
  banners: ['Promo banners', 'Your banners, below. Shows nothing while none are running.'],
  recently_viewed: ['Recently viewed', 'Each visitor’s own recent products (only once they have some).'],
  platforms: ['Your platform', 'PlayStation, Switch, Xbox and PC, with their best sellers.'],
  price_drops: ['Price drops', 'Discounted products: the deepest first, or the ones you pick.'],
  budget: ['Your budget', 'The coin stack: what the visitor can get for their money.'],
  world: ['Beyond the console', 'The grid of other categories: the built-in ones, or the ones you pick.'],
  ask_us: ['Ask first', 'Call or email before you buy.'],
  continue: ['Continue?', 'The closing credits with every brand.'],
};

/** The home page's sections: drag or move them, and switch each on or off. */
function Sections({ sections, onSaved }) {
  const { toast, fail } = useUi();
  const [order, setOrder] = useState(sections);
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrder(sections), [sections]);
  const dirty = JSON.stringify(order.map((s) => [s.key, s.visible])) !== JSON.stringify(sections.map((s) => [s.key, s.visible]));
  const move = (from, to) => setOrder((l) => { if (to < 0 || to >= l.length) return l; const a = [...l]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  const save = async () => {
    setBusy(true);
    try { await api.put('/homepage/sections', { sections: order.map((s) => ({ key: s.key, visible: s.visible })) }); changed('homepage'); toast('Home page saved. Visitors see it on their next page load.'); onSaved(); } catch (e) { fail(e); }
    setBusy(false);
  };
  return (
    <section className="surface">
      <div className="surface-head"><div><h3>Sections</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>The order visitors scroll through. Hidden sections are skipped; the “01 · …” labels follow what is shown.</p></div></div>
      <ul className="order-list">
        {order.map((s, i) => (
          <li key={s.key} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)} className={drag === i ? 'dragging' : ''}>
            <Icon name="grip" size={15} className="muted grip" />
            <span className="mono muted" style={{ fontSize: 11, width: 18 }}>{i + 1}</span>
            <span className="grow" style={{ minWidth: 0 }}><b className="clamp1" style={{ opacity: s.visible ? 1 : 0.55 }}>{SECTION[s.key]?.[0] || s.key}</b><small className="muted clamp1" style={{ display: 'block', fontSize: 11.5 }}>{SECTION[s.key]?.[1]}</small></span>
            <Toggle checked={s.visible} onChange={(v) => setOrder((l) => l.map((x) => (x.key === s.key ? { ...x, visible: v } : x)))} label={<span className="sr">{s.visible ? `Hide ${s.key}` : `Show ${s.key}`}</span>} />
            <Button size="sm" variant="quiet" icon="up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} />
            <Button size="sm" variant="quiet" icon="down" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} />
          </li>
        ))}
      </ul>
      {dirty && (
        <div className="drawer-foot" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
          <Button variant="quiet" onClick={() => setOrder(sections)}>Reset</Button>
          <Button variant="primary" icon="check" loading={busy} onClick={save}>Save sections</Button>
        </div>
      )}
    </section>
  );
}

/** Hand-picked items for a section (products for Price drops, categories for Beyond the console). */
function Picks({ section, categories, onSaved }) {
  const { toast, fail } = useUi();
  const initial = section.items.map((i) => i.id);
  const [ids, setIds] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setIds(section.items.map((i) => i.id)), [section]);
  const dirty = ids.join() !== initial.join();
  const save = async () => {
    setBusy(true);
    try { await api.put(`/homepage/sections/${section.key}/items`, { ids }); changed('homepage'); toast(ids.length ? 'Picks saved' : 'Back to choosing automatically'); onSaved(); } catch (e) { fail(e); }
    setBusy(false);
  };
  const products = section.picks === 'product';
  return (
    <section className="surface">
      <div className="surface-head">
        <div><h3>{SECTION[section.key][0]}</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{products ? 'Pick up to 12 discounted products, in order. Products show while they are discounted. Leave empty to show the deepest discounts.' : 'Pick up to 8 categories for the grid, in order; the built-in tiles fill any places left. Leave empty for the built-in tiles.'}</p></div>
        <Chip tone={ids.length ? 'blue' : 'muted'}>{ids.length ? `${ids.length} picked` : 'Automatic'}</Chip>
      </div>
      <div className="surface-body stack">
        {products ? <ProductPicker value={ids} onChange={setIds} placeholder="Search a product to pick…" /> : <CategoryPicker categories={categories} value={ids} onChange={setIds} maxHeight={240} />}
        {section.items.some((i) => !i.on_storefront) && <Notice tone="amber" icon="alert">Some picks aren’t on the storefront any more; they are skipped.</Notice>}
        {dirty && <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Button variant="quiet" onClick={() => setIds(initial)}>Reset</Button><Button variant="primary" icon="check" loading={busy} onClick={save}>Save picks</Button></div>}
      </div>
    </section>
  );
}

function BannerForm({ banner, onClose }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !banner.id;
  const [f, setF] = useState({ placement: banner.placement || 'home', title: banner.title || '', text: banner.text || '', link_url: banner.link_url || '', link_label: banner.link_label || '', image_url: banner.image_url || '', is_active: banner.is_active ?? true, starts_at: toInputDate(banner.starts_at), ends_at: toInputDate(banner.ends_at) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, title: f.title.trim(), text: f.text.trim() || null, link_url: f.link_url.trim() || null, link_label: f.link_label.trim() || null, image_url: f.placement === 'home' ? (f.image_url.trim() || null) : null, starts_at: fromInputDate(f.starts_at), ends_at: fromInputDate(f.ends_at) };
      if (isNew) await api.post('/banners', body); else await api.put(`/banners/${banner.id}`, body);
      changed('homepage'); toast(isNew ? 'Banner added' : 'Banner saved'); onClose(true);
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirm({ title: `Remove “${banner.title}”?`, text: 'It disappears from the shop straight away.', confirmLabel: 'Remove', danger: true }))) return;
    setBusy(true);
    try { await api.del(`/banners/${banner.id}`); changed('homepage'); toast('Banner removed'); onClose(true); } catch (e) { fail(e); }
    setBusy(false);
  };
  return (
    <Drawer title={isNew ? 'Add banner' : 'Edit banner'} onClose={() => onClose(false)}
      footer={<>
        {!isNew && <Button variant="danger" icon="trash" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>Remove</Button>}
        <Button variant="quiet" onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="primary" icon="check" loading={busy} disabled={f.title.trim().length < 2 || (f.link_url.trim() && !f.link_label.trim())} onClick={save}>{isNew ? 'Add banner' : 'Save'}</Button>
      </>}>
      <Field label="Where">
        <select className="select" value={f.placement} onChange={set('placement')}>
          <option value="home">Home page banner</option><option value="announcement">Announcement line (top of every page)</option>
        </select>
      </Field>
      <Field label="Title"><input className="input" maxLength={120} value={f.title} onChange={set('title')} placeholder={f.placement === 'home' ? 'e.g. Ramadan deals' : 'e.g. Free pickup from Hamra'} autoFocus /></Field>
      {f.placement === 'home' && <Field label="Text" hint="One or two short lines."><textarea className="textarea" maxLength={300} value={f.text} onChange={set('text')} /></Field>}
      <div className="grid-2">
        <Field label="Link" hint="A page of the store (/shop?on_sale=1) or an https:// address."><input className="input mono" value={f.link_url} onChange={set('link_url')} placeholder="/shop?on_sale=1" /></Field>
        <Field label="Link text"><input className="input" maxLength={40} value={f.link_label} onChange={set('link_label')} placeholder="e.g. Shop the sale" /></Field>
      </div>
      {f.placement === 'home' && <ImageField label="Background image" value={f.image_url} onChange={set('image_url')} />}
      <div className="grid-2">
        <Field label="Starts" hint="Empty = right away"><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="Ends" hint="Empty = until you remove it"><input className="input" type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></Field>
      </div>
      <Toggle label="Switched on" checked={f.is_active} onChange={set('is_active')} />
    </Drawer>
  );
}

export default function Homepage() {
  const { data, error, reload } = useApi('/homepage');
  const lists = useCatalogLists();
  const [editing, setEditing] = useState(null);
  const d = data?.data;
  const banners = d?.banners || [];

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Site</>} title="Homepage" text="What the store’s home page shows: the order of its sections, hand-picked products and categories, and banners."
        actions={<><a className="btn" href="/" target="_blank" rel="noopener noreferrer"><Icon name="external" />View home page</a><Button variant="primary" icon="plus" onClick={() => setEditing({})}>Add banner</Button></>} />
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      {!d ? <div className="surface"><SkeletonRows /></div> : (
        <div className="split">
          <div className="stack">
            <section className="surface">
              <div className="surface-head"><div><h3>Banners</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Home page banners show in the “Promo banners” section; the announcement shows on every page.</p></div></div>
              {!banners.length ? <Empty icon="image" title="No banners" action={<Button icon="plus" onClick={() => setEditing({})}>Add banner</Button>}>Announce a sale, a new arrival or opening hours.</Empty> : (
                <ul className="ledger">
                  {banners.map((b) => (
                    <li key={b.id}>
                      <button type="button" className="mini-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(b)}>
                        <Icon name={b.placement === 'home' ? 'image' : 'bell'} size={16} className="muted" />
                        <span className="grow" style={{ minWidth: 0 }}><b className="clamp1" style={{ fontWeight: 600 }}>{b.title}</b><small className="muted" style={{ display: 'block', fontSize: 12 }}>{b.placement === 'home' ? 'Home page' : 'Announcement'}{b.link_url ? ` · ${b.link_url}` : ''}{b.ends_at ? ` · until ${day(b.ends_at)}` : ''}</small></span>
                        {b.showing ? <Chip tone="green" led>Showing</Chip> : b.is_active ? <Chip tone="blue">Scheduled or ended</Chip> : <Chip tone="muted">Off</Chip>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {d.sections.filter((s) => s.picks).map((s) => <Picks key={s.key} section={s} categories={lists.categories} onSaved={() => reload(true)} />)}
          </div>
          <aside className="stack sticky-col">
            <Sections sections={d.sections} onSaved={() => reload(true)} />
            <Notice icon="info">Featured products are set on each product (Products → Featured). Category order is on the Categories screen.</Notice>
          </aside>
        </div>
      )}
      {editing && <BannerForm key={editing.id || 'new'} banner={editing} onClose={(saved) => { setEditing(null); if (saved) reload(true); }} />}
    </>
  );
}
