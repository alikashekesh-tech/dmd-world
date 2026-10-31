import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { Button, Chip, Notice, PageHeader, SkeletonRows, Toggle, useUi } from '../ui/kit.jsx';

/* Everything about the shop's menu, in one place: the links across the top (and in the phone menu), then the order
   of the categories and brands inside the Categories dropdown. Each change saves at once. The top links are a store
   setting (owner only); the category and brand order is the catalog's own (the same as on those pages). */

// The shop's top menu links, in the default order.
const LINKS = [['home', 'Home'], ['shop', 'Shop'], ['categories', 'Categories (dropdown)'], ['offers', 'New Offers'], ['used', 'Buy Used'], ['brands', 'Brands'], ['about', 'About Us'], ['contact', 'Contact Us']];

export default function Menu({ session }) {
  const owner = session?.owner?.role === 'owner';
  const cats = useCategories(); // both dropdown boxes show categories (a brand's lines and their sub-categories too)
  return (
    <>
      <PageHeader hud={<><span className="led blue" />Site</>} title="Menu" text="The order of the shop’s menu: the links across the top, and what’s inside the Categories dropdown. Changes show in the shop straight away." />
      <div className="split">
        <div className="stack">
          <TopLinks owner={owner} />
        </div>
        <div className="stack">
          <DropdownCategories cats={cats} />
          <DropdownBrands cats={cats} />
        </div>
      </div>
    </>
  );
}

/** One row of an ordered list: position, name, up and down; with `kids`, an arrow opens its sub-list underneath. */
function Row({ n, label, note, first, last, onMove, children, dim, kids, depth = 0 }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line-soft)', opacity: dim ? 0.6 : 1, background: depth ? 'var(--surface-2, transparent)' : undefined }}>
        {kids ? <Button size="sm" variant="quiet" icon={open ? 'down' : 'chevron'} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} the sub-categories of ${label}`} onClick={() => setOpen((o) => !o)} />
          : <span style={{ width: 30 }} aria-hidden="true" />}
        <span className="mono muted" style={{ width: 22, fontSize: 12 }}>{n}</span>
        <b className="grow" style={{ fontWeight: depth ? 500 : 600, minWidth: 0 }}>{label}{note && <> <Chip>{note}</Chip></>}</b>
        {children}
        <Button size="sm" variant="quiet" icon="up" aria-label={`Move ${label} up`} disabled={first} onClick={() => onMove(-1)} />
        <Button size="sm" variant="quiet" icon="down" aria-label={`Move ${label} down`} disabled={last} onClick={() => onMove(1)} />
      </div>
      {kids && open && <div style={{ paddingLeft: 26 }}>{kids}</div>}
    </li>
  );
}

const swap = (list, i, d) => { const a = [...list]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; };

/** The links across the top: shown ones in order, then the hidden ones. At least one stays shown. */
function TopLinks({ owner }) {
  const { toast, fail } = useUi();
  const { data, error } = useApi('/settings', { live: false });
  const [shown, setShown] = useState(null);
  useEffect(() => { if (data?.data?.menu_links) setShown(data.data.menu_links); }, [data]);
  const save = async (next) => {
    const before = shown;
    setShown(next);
    try { await api.put('/settings', { menu_links: next }); changed('settings'); toast('Top menu saved'); } catch (e) { setShown(before); fail(e); }
  };
  const label = (k) => LINKS.find(([m]) => m === k)?.[1] || k;
  const rows = shown ? [...shown, ...LINKS.map(([k]) => k).filter((k) => !shown.includes(k))] : [];
  return (
    <section className="surface">
      <div className="surface-head"><div><h3>Top menu</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>The links across the top of the shop, and in the phone menu, in this order.</p></div></div>
      <div className="surface-body stack">
        {!owner && <Notice icon="lock">Only the store owner can change the top menu.</Notice>}
        {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
        {!shown ? <SkeletonRows rows={5} /> : (
          <ol className="stack" style={{ gap: 6 }}>
            {rows.map((k) => {
              const i = shown.indexOf(k);
              const on = i >= 0;
              return (
                <Row key={k} n={on ? String(i + 1).padStart(2, '0') : '—'} label={label(k)} dim={!on} first={!owner || !on || i === 0} last={!owner || !on || i === shown.length - 1} onMove={(d) => save(swap(shown, i, d))}>
                  <Toggle label={on ? 'Shown' : 'Hidden'} checked={on} disabled={!owner || (on && shown.length === 1)} onChange={(v) => save(v ? [...shown, k] : shown.filter((x) => x !== k))} />
                </Row>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/** The admin's categories, kept here once for both dropdown boxes; a reorder updates them in place. */
function useCategories() {
  const { toast, fail } = useUi();
  const { data, error, setData } = useApi('/categories', { live: false });
  const all = useMemo(() => (data?.data || []).filter((c) => !c.archived_at), [data]);
  const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name);
  /** Categories directly under a parent (or, with no parent, a brand's lines / the main categories), in order. */
  const under = useCallback((parentId, brandId = null) => all.filter((c) => (parentId ? c.parent_id === parentId : !c.parent_id && (c.brand_id ?? null) === brandId)).sort(byPos), [all]);
  /** Saves a new order for one set of siblings (everything at that level is sent, as the server expects). */
  const reorder = async (siblings) => {
    const ids = siblings.map((c) => c.id);
    setData((x) => ({ ...x, data: x.data.map((c) => (ids.includes(c.id) ? { ...c, position: ids.indexOf(c.id) } : c)) }));
    try { await api.post('/categories/reorder', { ids }); changed('categories'); toast('Order saved'); } catch (e) { fail(e); }
  };
  return { ready: !!data, error, under, reorder };
}

/** One level of categories, each opening onto its own sub-categories (as deep as they go). */
function Level({ cats, list, hidden = [], depth = 1 }) {
  return (
    <ol className="stack" style={{ gap: 6 }}>
      {list.map((c, i) => {
        const subs = cats.under(c.id);
        return (
          <Row key={c.id} depth={depth} n={String(i + 1).padStart(2, '0')} label={c.name} note={c.is_visible === false ? 'Hidden in shop' : null} dim={c.is_visible === false}
            first={i === 0} last={i === list.length - 1} onMove={(d) => cats.reorder([...swap(list, i, d), ...hidden])}
            kids={subs.length ? <Level cats={cats} list={subs} depth={depth + 1} /> : null} />
        );
      })}
    </ol>
  );
}

/** "Shop by category" in the dropdown: the main categories (not a brand's own lines), and their sub-categories. */
function DropdownCategories({ cats }) {
  const top = cats.ready ? cats.under(null, null) : [];
  const list = top.filter((c) => c.slug !== 'new-offers'); // New Offers has its own top link
  return (
    <section className="surface">
      <div className="surface-head"><div><h3>Categories dropdown · categories</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>“Shop by category”. Open one with its arrow to order its sub-categories.</p></div></div>
      <div className="surface-body stack">
        {cats.error && <Notice tone="coral" icon="alert">{cats.error.message}</Notice>}
        {!cats.ready ? <SkeletonRows rows={4} /> : <Level cats={cats} list={list} hidden={top.filter((c) => c.slug === 'new-offers')} depth={0} />}
      </div>
    </section>
  );
}

/** "Shop by brand" in the dropdown: the brands in their order, each opening onto its own lines and sub-categories. */
function DropdownBrands({ cats }) {
  const { toast, fail } = useUi();
  const { data, error, setData } = useApi('/brands', { live: false });
  const list = useMemo(() => (data?.data || []).filter((b) => !b.archived_at).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)), [data]);
  const move = async (i, d) => {
    const ids = swap(list, i, d).map((b) => b.id);
    setData((x) => ({ ...x, data: x.data.map((b) => ({ ...b, position: ids.indexOf(b.id) })) }));
    try { await api.post('/brands/reorder', { ids }); changed('brands'); toast('Brand order saved'); } catch (e) { fail(e); }
  };
  return (
    <section className="surface">
      <div className="surface-head"><div><h3>Categories dropdown · brands</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>“Shop by brand”, and the Brands page in the shop. Open a brand to order its lines.</p></div></div>
      <div className="surface-body stack">
        {(error || cats.error) && <Notice tone="coral" icon="alert">{(error || cats.error).message}</Notice>}
        {!data || !cats.ready ? <SkeletonRows rows={4} /> : (
          <ol className="stack" style={{ gap: 6 }}>
            {list.map((b, i) => {
              const lines = cats.under(null, b.id);
              return (
                <Row key={b.id} n={String(i + 1).padStart(2, '0')} label={b.name} note={b.is_active === false ? 'Hidden in shop' : null} dim={b.is_active === false}
                  first={i === 0} last={i === list.length - 1} onMove={(d) => move(i, d)} kids={lines.length ? <Level cats={cats} list={lines} /> : null} />
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
