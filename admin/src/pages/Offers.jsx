import { useMemo, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { day, money, num, toInputDate, fromInputDate } from '../lib/format.js';
import { productFromApi, useCatalogLists } from '../lib/catalog.js';
import { Button, CategoryPicker, Check, Chip, Drawer, Empty, Field, Notice, PageHeader, ProductPicker, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const STATE = { running: ['green', 'Running'], scheduled: ['blue', 'Scheduled'], ended: ['muted', 'Ended'], off: ['muted', 'Off'] };
const off = (o) => (o.discount_type === 'percent' ? `${o.discount_value}% off` : `${money(o.discount_value)} off`);
const now = () => Date.now();
const t = (s) => (s ? new Date(s).getTime() : null);

export default function Offers({ query }) {
  const tab = query.get('tab') || 'offers';
  const offers = useApi('/offers');
  const coupons = useApi('/coupons');
  const sale = useApi(tab === 'sales' ? '/products?on_sale=1&per_page=100&sort=updated' : null);
  const lists = useCatalogLists();
  const editId = query.get('edit');
  const newWhat = query.get('new');
  const offerList = offers.data?.data || [];
  const couponList = coupons.data?.data || [];
  const offer = tab === 'offers' && (newWhat === 'offer' ? {} : editId ? offerList.find((c) => String(c.id) === editId) : null);
  const coupon = tab === 'coupons' && (newWhat === 'coupon' ? {} : editId ? couponList.find((c) => String(c.id) === editId) : null);
  const close = () => setQuery({ new: null, edit: null });
  const live = couponList.filter((c) => c.is_active && (!c.expires_at || t(c.expires_at) > now())).length;
  const running = offerList.filter((c) => c.state === 'running').length;
  const error = offers.error || coupons.error;

  return (
    <>
      <PageHeader hud={<><span className="led coral" />Catalog</>} title="Offers & discounts" text="Store-wide offers, coupon codes and everything on sale. Offers are worked into prices as they run; product prices themselves are never rewritten, so switching an offer off simply ends it."
        actions={tab === 'coupons'
          ? <Button variant="primary" icon="plus" onClick={() => setQuery({ new: 'coupon', edit: null })}>Create coupon</Button>
          : <Button variant="primary" icon="plus" onClick={() => setQuery({ tab: null, new: 'offer', edit: null })}>Create offer</Button>} />
      <div className="toolbar">
        <Tabs label="Offer type" value={tab} onChange={(v) => setQuery({ tab: v === 'offers' ? null : v, new: null, edit: null })} items={[
          { value: 'offers', label: 'Offers', count: offers.data ? offerList.length : undefined, led: running ? 'green' : undefined },
          { value: 'coupons', label: 'Coupons', count: coupons.data ? couponList.length : undefined, led: live ? 'green' : undefined },
          { value: 'sales', label: 'On sale now', count: sale.data?.meta?.total },
        ]} />
      </div>
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      {tab === 'offers' && (!offers.data ? <div className="surface"><SkeletonRows /></div> : <OfferList list={offerList} />)}
      {tab === 'coupons' && (!coupons.data ? <div className="surface"><SkeletonRows /></div> : <Coupons list={couponList} />)}
      {tab === 'sales' && (!sale.data ? <div className="surface"><SkeletonRows /></div> : <Sales list={paged(sale.data, productFromApi).items} />)}
      {offer && lists.ready && <OfferForm key={offer.id || 'new'} o={offer} categories={lists.categories} onClose={close} />}
      {coupon && lists.ready && <CouponForm key={coupon.id || 'new'} c={coupon} categories={lists.categories} onClose={close} />}
    </>
  );
}

/* ── offers ──────────────────────────────────────────────────────────── */
function OfferList({ list }) {
  const { toast, fail, confirm } = useUi();
  const [busy, setBusy] = useState(null);
  const toggle = async (o, on) => {
    setBusy(o.id);
    try { await api.put(`/offers/${o.id}/active`, { is_active: on }); changed('offers'); toast(on ? `“${o.name}” is on` : `“${o.name}” is off. Prices are back to normal.`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const remove = async (o) => {
    if (!(await confirm({ title: `Delete “${o.name}”?`, text: 'Its products go back to their own prices straight away. Orders already placed keep the price they were sold at.', confirmLabel: 'Delete offer', danger: true }))) return;
    setBusy(o.id);
    try { await api.del(`/offers/${o.id}`); changed('offers'); toast(`Deleted “${o.name}”`); } catch (e) { fail(e); }
    setBusy(null);
  };
  if (!list.length) return <div className="surface"><Empty icon="percent" title="No offers yet" action={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 'offer' })}>Create offer</Button>}>An offer takes a percentage or an amount off a group of products (categories, brands’ product lines or hand-picked items) for as long as you want.</Empty></div>;
  return (
    <div className="surface">
      <table className="table cards">
        <thead><tr><th>Offer</th><th>Discount</th><th>Products</th><th>When</th><th>Status</th><th className="shrink" /></tr></thead>
        <tbody>
          {list.map((o) => {
            const [tone, label] = STATE[o.state] || STATE.off;
            return (
              <tr key={o.id} className="clickable" onClick={() => setQuery({ edit: o.id })}>
                <td><div className="cell-main"><div><b>{o.name}</b><small>{o.label ? `Shown as “${o.label}”` : 'No storefront label'}</small></div></div></td>
                <td data-label="Discount"><Chip tone="coral">{off(o)}</Chip></td>
                <td data-label="Products" className="mono">{num(o.products_covered)}<span className="muted" style={{ fontSize: 11.5 }}> {o.category_ids.length ? `· ${o.category_ids.length} categor${o.category_ids.length === 1 ? 'y' : 'ies'}` : ''}</span></td>
                <td data-label="When" className="t2" style={{ fontSize: 12.5 }}>{o.starts_at ? day(o.starts_at) : 'Now'} → {o.ends_at ? day(o.ends_at) : 'until you stop it'}</td>
                <td data-label="Status"><Chip tone={tone} led>{label}</Chip></td>
                <td className="shrink" onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <Toggle checked={o.is_active} disabled={busy === o.id} onChange={(v) => toggle(o, v)} label={<span className="sr">{o.is_active ? 'Switch off' : 'Switch on'}</span>} />
                    <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${o.name}`} onClick={() => setQuery({ edit: o.id })} />
                    <Button size="sm" variant="quiet" icon="trash" aria-label={`Delete ${o.name}`} loading={busy === o.id} onClick={() => remove(o)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OfferForm({ o, categories, onClose }) {
  const { toast, fail } = useUi();
  const isNew = !o.id;
  const [f, setF] = useState({ name: o.name || '', label: o.label || '', type: o.discount_type || 'percent', value: o.discount_value ?? '', start: toInputDate(o.starts_at), end: toInputDate(o.ends_at), active: o.is_active ?? true, productIds: o.product_ids || [], categoryIds: o.category_ids || [] });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name.trim(), label: f.label.trim() || null, discount_type: f.type, discount_value: Number(f.value), starts_at: fromInputDate(f.start), ends_at: fromInputDate(f.end), is_active: f.active, product_ids: f.productIds, category_ids: f.categoryIds };
      const { data: r } = isNew ? await api.post('/offers', body) : await api.put(`/offers/${o.id}`, body);
      changed('offers');
      toast(`“${r.name}” ${isNew ? 'created' : 'saved'}: ${num(r.products_covered)} product${r.products_covered === 1 ? '' : 's'} covered`);
      onClose();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const example = Number(f.value) > 0 ? (f.type === 'percent' ? 100 * (1 - Number(f.value) / 100) : Math.max(0, 100 - Number(f.value))) : null;
  return (
    <Drawer wide title={isNew ? 'Create offer' : `Edit “${o.name}”`} hud={isNew ? 'Offer' : `${STATE[o.state]?.[1] || ''} · ${num(o.products_covered)} products`} onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" loading={busy} onClick={save} disabled={!f.name.trim() || !(Number(f.value) > 0) || !(f.productIds.length || f.categoryIds.length)}>{isNew ? 'Create offer' : 'Save'}</Button></>}>
      <div className="grid-2">
        <Field label="Name" hint="For you."><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Back to school headsets" autoFocus /></Field>
        <Field label="Label in the shop" hint="Optional, short."><input className="input" maxLength={40} value={f.label} onChange={set('label')} placeholder="e.g. School sale" /></Field>
      </div>
      <div className="grid-2">
        <Field label="Discount type">
          <Tabs label="Discount type" value={f.type} onChange={set('type')} items={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed amount' }]} />
        </Field>
        <Field label={f.type === 'percent' ? 'Percent off' : 'Amount off each product'} hint={example != null ? `A $100.00 product would sell for ${money(example)}.` : null}>
          <span className="input-affix"><span>{f.type === 'percent' ? '%' : '$'}</span><input className="input mono" inputMode="decimal" value={f.value} onChange={set('value')} /></span>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Starts" hint="Empty = right away"><input className="input" type="datetime-local" value={f.start} onChange={set('start')} /></Field>
        <Field label="Ends" hint="Empty = until you switch it off"><input className="input" type="datetime-local" value={f.end} onChange={set('end')} /></Field>
      </div>
      <Toggle label="Switched on" checked={f.active} onChange={set('active')} />
      <Field label="Categories" hint="Every product inside them (including subcategories) is covered.">
        <CategoryPicker categories={categories} value={f.categoryIds} onChange={set('categoryIds')} maxHeight={220} />
      </Field>
      <Field label="Individual products"><ProductPicker value={f.productIds} onChange={set('productIds')} /></Field>
      <Notice icon="info">The shop, cart and checkout all use the lowest price: the regular price, the product’s own sale or a running offer. A fixed amount as large as a product’s price doesn’t apply to it.</Notice>
    </Drawer>
  );
}

/* ── coupons ─────────────────────────────────────────────────────────── */
/** A coupon as the API takes it (every field: PUT replaces the coupon's rules). */
const couponBody = (c, over = {}) => ({
  code: c.code, description: c.description || null, discount_type: c.discount_type, amount: Number(c.amount),
  minimum_spend: c.minimum_spend ?? null, maximum_spend: c.maximum_spend ?? null, usage_limit: c.usage_limit ?? null, usage_limit_per_customer: c.usage_limit_per_customer ?? null,
  exclude_sale_items: !!c.exclude_sale_items, starts_at: c.starts_at || null, expires_at: c.expires_at || null, is_active: !!c.is_active,
  product_ids: c.product_ids || [], category_ids: c.category_ids || [], excluded_product_ids: c.excluded_product_ids || [], excluded_category_ids: c.excluded_category_ids || [], ...over,
});

function Coupons({ list }) {
  const { toast, fail } = useUi();
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  const toggle = async (c, on) => {
    setBusy(c.id);
    try { await api.put(`/coupons/${c.id}`, couponBody(c, { is_active: on })); changed('offers'); toast(on ? `${c.code} works again` : `${c.code} is switched off`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const trash = async (c) => {
    setBusy(c.id);
    try {
      await api.del(`/coupons/${c.id}`); changed('offers');
      toast(`Moved ${c.code} to the trash`, { undo: async () => { await api.post(`/coupons/${c.id}/restore`).catch(fail); changed('offers'); } });
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const rows = list.filter((c) => c.code.toLowerCase().includes(q.trim().toLowerCase()));
  if (!list.length) return <div className="surface"><Empty icon="sparkle" title="No coupons yet" action={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 'coupon' })}>Create coupon</Button>}>Coupons are codes buyers type at checkout. Good for influencers, newsletters and returning customers.</Empty></div>;
  return (
    <>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Find a code" /></div>
      <div className="surface">
        <table className="table cards">
          <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Expires</th><th>Status</th><th className="shrink" /></tr></thead>
          <tbody>
            {rows.map((c) => {
              const expired = c.expires_at && t(c.expires_at) < now();
              return (
                <tr key={c.id} className="clickable" onClick={() => setQuery({ edit: c.id })}>
                  <td><div className="cell-main"><span className="coupon-code">{c.code}</span>{c.description && <small className="clamp1" style={{ maxWidth: 220 }}>{c.description}</small>}</div></td>
                  <td data-label="Discount">{c.label}{c.minimum_spend > 0 && <small className="muted" style={{ display: 'block', fontSize: 11.5 }}>orders over {money(c.minimum_spend)}</small>}</td>
                  <td data-label="Used" className="mono">{num(c.uses)}{c.usage_limit ? <span className="muted"> / {num(c.usage_limit)}</span> : ''}{c.discount_given > 0 && <small className="muted" style={{ display: 'block', fontSize: 11 }}>{money(c.discount_given)} given</small>}</td>
                  <td data-label="Expires" className="t2" style={{ fontSize: 12.5 }}>{c.expires_at ? day(c.expires_at) : 'Never'}</td>
                  <td data-label="Status">{expired ? <Chip tone="muted">Expired</Chip> : c.is_active ? <Chip tone="green" led>Active</Chip> : <Chip tone="muted">Off</Chip>}</td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Toggle checked={c.is_active} disabled={busy === c.id} onChange={(v) => toggle(c, v)} label={<span className="sr">{c.is_active ? 'Switch off' : 'Switch on'}</span>} />
                      <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${c.code}`} onClick={() => setQuery({ edit: c.id })} />
                      <Button size="sm" variant="quiet" icon="trash" aria-label={`Move ${c.code} to the trash`} onClick={() => trash(c)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CouponForm({ c, categories, onClose }) {
  const { toast, fail } = useUi();
  const isNew = !c.id;
  const [f, setF] = useState({
    code: c.code || '', discount_type: c.discount_type || 'percent', amount: c.amount ? String(c.amount) : '', description: c.description || '',
    starts_at: toInputDate(c.starts_at), expires_at: toInputDate(c.expires_at), minimum_spend: c.minimum_spend > 0 ? String(c.minimum_spend) : '', maximum_spend: c.maximum_spend > 0 ? String(c.maximum_spend) : '',
    usage_limit: c.usage_limit ?? '', usage_limit_per_customer: c.usage_limit_per_customer ?? '', exclude_sale_items: !!c.exclude_sale_items, is_active: c.is_active ?? true,
    product_ids: c.product_ids || [], category_ids: c.category_ids || [], excluded_product_ids: c.excluded_product_ids || [], excluded_category_ids: c.excluded_category_ids || [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      const body = couponBody({
        ...f, code: f.code.trim(), amount: f.amount, minimum_spend: n(f.minimum_spend), maximum_spend: n(f.maximum_spend), usage_limit: n(f.usage_limit), usage_limit_per_customer: n(f.usage_limit_per_customer),
        starts_at: fromInputDate(f.starts_at), expires_at: fromInputDate(f.expires_at),
      });
      const { data: r } = isNew ? await api.post('/coupons', body) : await api.put(`/coupons/${c.id}`, body);
      changed('offers');
      toast(isNew ? `Coupon ${r.code} is ready to use` : `Saved ${r.code}`);
      onClose();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const suggest = () => setF((x) => ({ ...x, code: `DMD${Math.random().toString(36).slice(2, 7).toUpperCase()}` }));
  return (
    <Drawer wide title={isNew ? 'Create coupon' : `Edit ${c.code}`} hud={isNew ? 'Coupon' : `Used ${num(c.uses)} times`} onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" loading={busy} onClick={save} disabled={f.code.trim().length < 3 || !(Number(f.amount) > 0)}>{isNew ? 'Create coupon' : 'Save'}</Button></>}>
      <Field label="Code" hint="What buyers type at checkout. Letters, numbers, - and _ only; not case-sensitive.">
        <div className="row"><input className="input mono grow" style={{ textTransform: 'uppercase' }} value={f.code} onChange={set('code')} placeholder="e.g. GAMER10" autoFocus={isNew} />{isNew && <Button icon="sparkle" onClick={suggest}>Suggest</Button>}</div>
      </Field>
      <div className="grid-2">
        <Field label="Type">
          <select className="select" value={f.discount_type} onChange={set('discount_type')}>
            <option value="percent">Percent off</option><option value="fixed_cart">Fixed amount off the cart</option><option value="fixed_product">Fixed amount off each item</option>
          </select>
        </Field>
        <Field label="Amount"><span className="input-affix"><span>{f.discount_type === 'percent' ? '%' : '$'}</span><input className="input mono" inputMode="decimal" value={f.amount} onChange={set('amount')} /></span></Field>
      </div>
      <Field label="Note to self"><input className="input" value={f.description} onChange={set('description')} placeholder="e.g. Instagram giveaway, October" /></Field>
      <div className="grid-2">
        <Field label="Starts" hint="Empty = right away"><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="Expires" hint="Empty = never"><input className="input" type="datetime-local" value={f.expires_at} onChange={set('expires_at')} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Minimum spend"><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={f.minimum_spend} onChange={set('minimum_spend')} placeholder="none" /></span></Field>
        <Field label="Maximum spend"><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={f.maximum_spend} onChange={set('maximum_spend')} placeholder="none" /></span></Field>
      </div>
      <div className="grid-2">
        <Field label="Total uses"><input className="input mono" type="number" min="1" value={f.usage_limit} onChange={set('usage_limit')} placeholder="unlimited" /></Field>
        <Field label="Uses per buyer" hint="By account or email."><input className="input mono" type="number" min="1" value={f.usage_limit_per_customer} onChange={set('usage_limit_per_customer')} placeholder="unlimited" /></Field>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <label className="row" style={{ cursor: 'pointer' }}><Check on={f.exclude_sale_items} onChange={set('exclude_sale_items')} label="Not on sale items" /><span className="t2" style={{ fontSize: 13 }}>Doesn’t apply to items already on sale</span></label>
        <Toggle label="Switched on" checked={f.is_active} onChange={set('is_active')} />
      </div>
      <Field label="Only for these products" hint="Leave both empty to allow the whole store."><ProductPicker value={f.product_ids} onChange={set('product_ids')} /></Field>
      <Field label="Only for these categories"><CategoryPicker categories={categories} value={f.category_ids} onChange={set('category_ids')} maxHeight={180} /></Field>
      <Field label="Never for these products"><ProductPicker value={f.excluded_product_ids} onChange={set('excluded_product_ids')} /></Field>
      <Field label="Never for these categories"><CategoryPicker categories={categories} value={f.excluded_category_ids} onChange={set('excluded_category_ids')} maxHeight={180} /></Field>
    </Drawer>
  );
}

/* ── products on sale ────────────────────────────────────────────────── */
function Sales({ list }) {
  const { toast, fail } = useUi();
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  const end = async (p) => {
    setBusy(p.id);
    try { await api.put(`/products/${p.id}`, { sale_price: null, sale_starts_at: null, sale_ends_at: null }); changed('offers'); toast(`${p.name}: its own sale price is removed`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const rows = useMemo(() => list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (1 - b.price / b.regular_price) - (1 - a.price / a.regular_price)), [list, q]);
  if (!list.length) return <div className="surface"><Empty icon="percent" title="Nothing is on sale">Set a sale price on a product, or create an offer for a whole category.</Empty></div>;
  return (
    <>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Find a product" /></div>
      <div className="surface">
        <table className="table cards">
          <thead><tr><th>Product</th><th className="right">Price</th><th>Off</th><th>Ends</th><th>Source</th><th className="shrink" /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const pctOff = p.regular_price > 0 ? Math.round((1 - p.price / p.regular_price) * 100) : 0;
              return (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
                  <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b>{p.name}</b><small>{p.status !== 'published' ? `${p.status} · ` : ''}{p.sku || `ID ${p.id}`}</small></div></div></td>
                  <td className="right" data-label="Price"><b className="num" style={{ color: 'var(--coral)' }}>{money(p.price)}</b> <del className="muted" style={{ fontSize: 12 }}>{money(p.regular_price)}</del></td>
                  <td data-label="Off"><Chip tone="coral">−{pctOff}%</Chip></td>
                  <td data-label="Ends" className="t2" style={{ fontSize: 12.5 }}>{p.offer ? 'With the offer' : p.sale_ends_at ? day(p.sale_ends_at) : 'No end date'}</td>
                  <td data-label="Source">{p.offer ? <a className="linkish" href={`#/offers?edit=${p.offer.id}`} onClick={(e) => e.stopPropagation()}>{p.offer.name}</a> : <span className="muted">Its own sale price</span>}</td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>{p.sale_price != null && <Button size="sm" variant="quiet" icon="close" loading={busy === p.id} onClick={() => end(p)}>End its sale</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
