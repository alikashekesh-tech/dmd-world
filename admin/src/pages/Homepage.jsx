import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useCatalogLists } from '../lib/catalog.js';
import { Button, Chip, Empty, Icon, Notice, PageHeader, SkeletonRows, Tabs, Toggle, useUi } from '../ui/kit.jsx';
import { whenLabel } from '../ui/DateTimeField.jsx';
import BannerEditor from './homepage/BannerEditor.jsx';
import Picks from './homepage/Picks.jsx';
import '../styles/homepage.css';

const SECTION = {
  hero: ['The desk', 'The opening scene: objects on the desk link to shop searches.'],
  banners: ['Promo banners', 'Your home page banners. Shows nothing while none are running.'],
  recently_viewed: ['Recently viewed', 'Each visitor’s own recent products (only once they have some).'],
  platforms: ['Your platform', 'PlayStation, Switch, Xbox and PC, with their best sellers.'],
  price_drops: ['Price drops', 'Discounted products: the deepest first, or the ones you pick.'],
  budget: ['Your budget', 'The coin stack: what the visitor can get for their money.'],
  world: ['Beyond the console', 'The grid of other categories: the built-in ones, or the ones you pick.'],
  ask_us: ['Ask first', 'Call or email before you buy.'],
  continue: ['Continue?', 'The closing credits with every brand.'],
};
const STATE = { live: ['green', 'Live'], scheduled: ['blue', 'Scheduled'], ended: ['amber', 'Ended'], off: ['muted', 'Off'] };
const statusOf = (b) => b.status || (b.showing ? 'live' : b.is_active ? 'scheduled' : 'off');

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
  const shown = order.filter((s) => s.visible).length;
  return (
    <section className="surface">
      <div className="surface-head hp-head">
        <div className="grow"><h3>Sections</h3><p className="hp-desc">The order visitors scroll through, top to bottom. Drag a section or use the arrows; switch one off to skip it. The “01 · …” labels on the storefront follow what is shown.</p></div>
        <Chip tone="blue">{shown} of {order.length} shown</Chip>
      </div>
      <ol className="sec-list">
        {order.map((s, i) => (
          <li key={s.key} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)} className={`${drag === i ? 'dragging' : ''} ${s.visible ? '' : 'hidden-sec'}`}>
            <Icon name="grip" size={15} className="muted grip" />
            <span className="pick-n mono">{i + 1}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b>{SECTION[s.key]?.[0] || s.key}{!s.visible && <span className="muted" style={{ fontWeight: 500 }}> · hidden</span>}</b>
              <small>{SECTION[s.key]?.[1]}</small>
            </span>
            <Toggle checked={s.visible} onChange={(v) => setOrder((l) => l.map((x) => (x.key === s.key ? { ...x, visible: v } : x)))} label={<span className="sr">{s.visible ? `Hide ${SECTION[s.key]?.[0]}` : `Show ${SECTION[s.key]?.[0]}`}</span>} />
            <span className="sec-arrows">
              <Button size="sm" variant="quiet" icon="up" aria-label={`Move ${SECTION[s.key]?.[0]} up`} disabled={i === 0} onClick={() => move(i, i - 1)} />
              <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${SECTION[s.key]?.[0]} down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)} />
            </span>
          </li>
        ))}
      </ol>
      {dirty && (
        <div className="drawer-foot" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
          <Button variant="quiet" onClick={() => setOrder(sections)}>Reset</Button>
          <Button variant="primary" icon="check" loading={busy} onClick={save}>Save sections</Button>
        </div>
      )}
    </section>
  );
}

function when(b) {
  const s = statusOf(b);
  if (s === 'scheduled' && b.starts_at) return `Starts ${whenLabel(b.starts_at)}${b.ends_at ? ` · ends ${whenLabel(b.ends_at)}` : ''}`;
  if (s === 'ended') return `Ended ${whenLabel(b.ends_at)}`;
  if (b.ends_at) return `Until ${whenLabel(b.ends_at)}`;
  return b.starts_at && new Date(b.starts_at) > new Date() ? `Starts ${whenLabel(b.starts_at)}` : 'No end date';
}

/** One placement's banners: thumbnails, state, an on/off switch, ordering and actions. */
function BannerGroup({ title, text, placement, banners, onEdit, onReload }) {
  const { toast, fail, confirm } = useUi();
  const [list, setList] = useState(banners);
  const [busy, setBusy] = useState(null);
  const [drag, setDrag] = useState(null);
  useEffect(() => setList(banners), [banners]);
  const home = placement === 'home';

  const persistOrder = async (next) => {
    setList(next);
    try { await api.post('/banners/reorder', { ids: next.map((b) => b.id) }); changed('homepage'); } catch (e) { fail(e); setList(banners); }
  };
  const move = (from, to) => { if (to < 0 || to >= list.length) return; const a = [...list]; const [x] = a.splice(from, 1); a.splice(to, 0, x); persistOrder(a); };
  const toggle = async (b, on) => {
    setBusy(b.id);
    setList((l) => l.map((x) => (x.id === b.id ? { ...x, is_active: on, status: on ? x.status : 'off' } : x)));
    try { await api.patch(`/banners/${b.id}/active`, { is_active: on }); changed('homepage'); toast(on ? `“${b.title}” switched on` : `“${b.title}” switched off`); onReload(); } catch (e) { fail(e); setList(banners); }
    setBusy(null);
  };
  const duplicate = async (b) => {
    setBusy(b.id);
    try {
      const copy = { placement: b.placement, title: `Copy of ${b.title}`.slice(0, 120), text: b.text, link_url: b.link_url, link_label: b.link_label, image_url: b.image_url, image_mobile_url: b.image_mobile_url, focal_point: b.focal_point, overlay: home ? b.overlay : null, is_active: false, starts_at: b.starts_at, ends_at: b.ends_at };
      await api.post('/banners', copy); changed('homepage'); toast('Duplicated. The copy is switched off until you are ready.'); onReload();
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const remove = async (b) => {
    if (!(await confirm({ title: `Delete “${b.title}”?`, text: 'It disappears from the shop straight away. This can’t be undone.', confirmLabel: 'Delete banner', danger: true }))) return;
    setBusy(b.id);
    try { await api.del(`/banners/${b.id}`); changed('homepage'); toast('Banner deleted'); onReload(); } catch (e) { fail(e); }
    setBusy(null);
  };

  return (
    <section className="surface">
      <div className="surface-head hp-head">
        <div className="grow"><h3>{title}</h3><p className="hp-desc">{text}</p></div>
        <Button size="sm" icon="plus" onClick={() => onEdit({ placement })}>Add</Button>
      </div>
      {!list.length ? (
        <Empty icon={home ? 'image' : 'bell'} title={home ? 'No home page banners' : 'No announcement'} action={<Button icon="plus" onClick={() => onEdit({ placement })}>{home ? 'Add a banner' : 'Add an announcement'}</Button>}>
          {home ? 'Promote a sale, a new arrival or a brand with a large image banner.' : 'A short line at the top of every page: opening hours, free pickup, a sale.'}
        </Empty>
      ) : (
        <ol className="bn-list">
          {list.map((b, i) => {
            const [tone, label] = STATE[statusOf(b)];
            return (
              <li key={b.id} className={`bn-row ${drag === i ? 'dragging' : ''}`} draggable={list.length > 1}
                onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { const a = [...list]; const [x] = a.splice(drag, 1); a.splice(i, 0, x); setList(a); setDrag(i); } }}
                onDragEnd={() => { setDrag(null); if (list.map((x) => x.id).join() !== banners.map((x) => x.id).join()) persistOrder(list); }}>
                {list.length > 1 && <Icon name="grip" size={15} className="muted grip" />}
                <button type="button" className="bn-thumb" onClick={() => onEdit(b)} aria-label={`Edit ${b.title}`}>
                  {home && b.image_url ? <img src={b.image_url} alt="" style={{ objectPosition: b.focal_point || '50% 50%' }} referrerPolicy="no-referrer" /> : <span className="bn-thumb-plain"><Icon name={home ? 'image' : 'bell'} size={18} /></span>}
                </button>
                <button type="button" className="bn-info" onClick={() => onEdit(b)}>
                  <b className="clamp1">{b.title}</b>
                  {b.text && <span className="bn-sub clamp2">{b.text}</span>}
                  <span className="bn-meta">
                    <span><Icon name="clock" size={12} />{when(b)}</span>
                    {b.link_url && <span className="mono clamp1"><Icon name="link" size={12} />{home && b.link_label ? `${b.link_label} → ` : ''}{b.link_url}</span>}
                  </span>
                </button>
                <div className="bn-side">
                  <Chip tone={tone} led={tone !== 'muted'}>{label}</Chip>
                  <Toggle checked={b.is_active} disabled={busy === b.id} onChange={(on) => toggle(b, on)} label={<span className="sr">{b.is_active ? `Switch off ${b.title}` : `Switch on ${b.title}`}</span>} />
                  <span className="bn-actions">
                    {list.length > 1 && <>
                      <Button size="sm" variant="quiet" icon="up" aria-label={`Move ${b.title} up`} disabled={i === 0} onClick={() => move(i, i - 1)} />
                      <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${b.title} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)} />
                    </>}
                    <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${b.title}`} title="Edit" onClick={() => onEdit(b)} />
                    <Button size="sm" variant="quiet" icon="layers" aria-label={`Duplicate ${b.title}`} title="Duplicate" loading={busy === b.id} onClick={() => duplicate(b)} />
                    <Button size="sm" variant="quiet" icon="trash" aria-label={`Delete ${b.title}`} title="Delete" onClick={() => remove(b)} />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function Homepage() {
  const { data, error, reload } = useApi('/homepage');
  const lists = useCatalogLists();
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('banners');
  const d = data?.data;
  const banners = d?.banners || [];
  const home = banners.filter((b) => b.placement === 'home');
  const announce = banners.filter((b) => b.placement === 'announcement');
  const counts = banners.reduce((m, b) => ({ ...m, [statusOf(b)]: (m[statusOf(b)] || 0) + 1 }), {});
  const bannersSection = d?.sections.find((s) => s.key === 'banners');
  const picks = d?.sections.filter((s) => s.picks) || [];

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Site</>} title="Homepage" text="What the store’s home page shows: banners, the order of its sections, and hand-picked products and categories."
        actions={<><a className="btn" href="/" target="_blank" rel="noopener noreferrer"><Icon name="external" />View home page</a><Button variant="primary" icon="plus" onClick={() => setEditing({ placement: 'home' })}>Add banner</Button></>} />
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      {!d ? <div className="surface"><SkeletonRows /></div> : (
        <div className="stack">
          <Tabs label="Homepage settings" value={tab} onChange={setTab} items={[
            { value: 'banners', label: 'Banners', count: banners.length },
            { value: 'sections', label: 'Sections', count: d.sections.filter((s) => s.visible).length },
            { value: 'picks', label: 'Hand-picked', count: picks.reduce((n, s) => n + s.items.length, 0) },
          ]} />

          {tab === 'banners' && (
            <div className="stack">
              <div className="hp-summary">
                {['live', 'scheduled', 'ended', 'off'].map((k) => <span key={k} className={`hp-stat ${counts[k] ? '' : 'zero'}`}><Chip tone={STATE[k][0]} led={STATE[k][0] !== 'muted'}>{STATE[k][1]}</Chip><b className="num">{counts[k] || 0}</b></span>)}
                <span className="grow" />
                <span className="muted" style={{ fontSize: 12.5 }}>Changes reach visitors on their next page load.</span>
              </div>
              {bannersSection && !bannersSection.visible && home.length > 0 && (
                <Notice tone="amber" icon="alert">The “Promo banners” section is hidden, so home page banners don’t show. <button type="button" className="linkish" onClick={() => setTab('sections')}>Show it in Sections</button></Notice>
              )}
              <BannerGroup title="Home page banners" placement="home" banners={home} onEdit={setEditing} onReload={() => reload(true)}
                text="Large image banners in the “Promo banners” section. One shows full width; two or three sit side by side; more become a swipeable row." />
              <BannerGroup title="Announcement line" placement="announcement" banners={announce} onEdit={setEditing} onReload={() => reload(true)}
                text="One short line at the top of every page. If several are running, the first one in this list shows." />
            </div>
          )}

          {tab === 'sections' && (
            <div className="hp-cols">
              <Sections sections={d.sections} onSaved={() => reload(true)} />
              <div className="stack">
                <Notice icon="info">Featured products are set on each product (Products → Featured). The order of categories in menus is on the Categories screen.</Notice>
                <Notice icon="sparkle">“Price drops” and “Beyond the console” can show products and categories you choose: see the Hand-picked tab.</Notice>
              </div>
            </div>
          )}

          {tab === 'picks' && (
            <div className="hp-picks">
              {picks.map((s) => <Picks key={s.key} section={s} title={SECTION[s.key]?.[0] || s.key} categories={lists.categories} onSaved={() => reload(true)} />)}
            </div>
          )}
        </div>
      )}
      {editing && <BannerEditor key={editing.id || `new-${editing.placement}`} banner={editing} onClose={(saved) => { setEditing(null); if (saved) reload(true); }} />}
    </>
  );
}
