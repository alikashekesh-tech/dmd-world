import { useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, day, money, num, toInputDate, fromInputDate } from '../lib/format.js';
import { Button, CategoryPicker, Check, Chip, Drawer, Empty, Field, Notice, PageHeader, ProductPicker, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const now = () => Date.now();
const t = (s) => (s ? new Date(s).getTime() : null);
function campaignState(c) {
  if (!c.enabled) return ['muted', 'Off'];
  if (c.end && t(c.end) < now()) return ['muted', 'Ended'];
  if (c.start && t(c.start) > now()) return ['blue', 'Scheduled'];
  return ['green', 'Running'];
}
const off = (c) => (c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`);
const couponOff = (c) => (c.discount_type === 'percent' ? `${Number(c.amount)}% off` : c.discount_type === 'fixed_product' ? `${money(c.amount)} off each item` : `${money(c.amount)} off the cart`);

export default function Offers({ query }) {
  const tab = query.get('tab') || 'campaigns';
  const { data, error } = useApi('/offers');
  const cats = useApi('/categories', { live: false });
  const editId = query.get('edit');
  const newWhat = query.get('new');
  const campaign = tab === 'campaigns' && (newWhat === 'campaign' ? {} : editId ? data?.campaigns.find((c) => c.id === editId) : null);
  const coupon = tab === 'coupons' && (newWhat === 'coupon' ? {} : editId ? data?.coupons.find((c) => String(c.id) === editId) : null);
  const close = () => setQuery({ new: null, edit: null });
  const activeCoupons = (data?.coupons || []).filter((c) => c.status === 'publish' && (!c.date_expires || t(c.date_expires) > now())).length;
  const running = (data?.campaigns || []).filter((c) => campaignState(c)[1] === 'Running').length;

  return (
    <>
      <PageHeader hud={<><span className="led coral" />Catalog</>} title="Offers & discounts" text="Sale prices, store-wide campaigns and coupon codes. Campaigns set real sale prices on products and put them back when you switch them off."
        actions={tab === 'coupons'
          ? <Button variant="primary" icon="plus" onClick={() => setQuery({ new: 'coupon', edit: null })}>Create coupon</Button>
          : <Button variant="primary" icon="plus" onClick={() => setQuery({ tab: null, new: 'campaign', edit: null })}>Create offer</Button>} />
      <div className="toolbar">
        <Tabs label="Offer type" value={tab} onChange={(v) => setQuery({ tab: v === 'campaigns' ? null : v, new: null, edit: null })} items={[
          { value: 'campaigns', label: 'Campaigns', count: data?.campaigns.length, led: running ? 'green' : undefined },
          { value: 'coupons', label: 'Coupons', count: data?.coupons.length, led: activeCoupons ? 'green' : undefined },
          { value: 'sales', label: 'On sale now', count: data?.sales.length },
        ]} />
      </div>
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      {!data ? <div className="surface"><SkeletonRows /></div> : tab === 'campaigns' ? <Campaigns list={data.campaigns} /> : tab === 'coupons' ? <Coupons list={data.coupons} /> : <Sales list={data.sales} campaigns={data.campaigns} />}
      {data && campaign && cats.data && <CampaignForm key={campaign.id || 'new'} c={campaign} categories={cats.data.items} onClose={close} />}
      {data && coupon && cats.data && <CouponForm key={coupon.id || 'new'} c={coupon} categories={cats.data.items} onClose={close} />}
    </>
  );
}

/* ── campaigns ───────────────────────────────────────────────────────── */
function Campaigns({ list }) {
  const { toast, fail, confirm } = useUi();
  const [busy, setBusy] = useState(null);
  const run = async (c, action) => {
    if (action === 'delete' && !(await confirm({ title: `Remove “${c.name}”?`, text: c.enabled ? 'Its products go back to their previous prices first. Products you edited by hand since are left alone.' : 'The offer is removed from this list.', confirmLabel: 'Remove offer', danger: true }))) return;
    setBusy(c.id);
    try {
      if (action === 'delete') await api.del(`/campaigns/${c.id}`); else await api.post(`/campaigns/${c.id}/${action}`);
      changed('offers');
      toast(action === 'disable' ? `“${c.name}” is off. Prices are back to normal.` : action === 'enable' ? `“${c.name}” is on again` : `Removed “${c.name}”`);
    } catch (e) { fail(e); }
    setBusy(null);
  };
  if (!list.length) return <div className="surface"><Empty icon="percent" title="No campaigns yet" action={<Button variant="primary" icon="plus" onClick={() => setQuery({ new: 'campaign' })}>Create offer</Button>}>A campaign puts a sale price on a group of products (a category, a brand, or hand-picked items) for as long as you want, then puts the prices back.</Empty></div>;
  return (
    <div className="surface">
      <table className="table cards">
        <thead><tr><th>Offer</th><th>Discount</th><th>Products</th><th>When</th><th>Status</th><th className="shrink" /></tr></thead>
        <tbody>
          {list.map((c) => {
            const [tone, label] = campaignState(c);
            return (
              <tr key={c.id} className="clickable" onClick={() => setQuery({ edit: c.id })}>
                <td><div className="cell-main"><div><b>{c.name}</b><small>Created {ago(c.createdAt)}</small></div></div></td>
                <td data-label="Discount"><Chip tone="coral">{off(c)}</Chip></td>
                <td data-label="Products" className="mono">{c.enabled ? num(c.applied?.length || 0) : '—'}<span className="muted" style={{ fontSize: 11.5 }}> {c.categoryIds?.length ? `· ${c.categoryIds.length} categor${c.categoryIds.length === 1 ? 'y' : 'ies'}` : ''}</span></td>
                <td data-label="When" className="t2" style={{ fontSize: 12.5 }}>{c.start ? day(c.start) : 'Now'} → {c.end ? day(c.end) : 'until you stop it'}</td>
                <td data-label="Status"><Chip tone={tone} led>{label}</Chip></td>
                <td className="shrink" onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <Toggle checked={c.enabled} disabled={busy === c.id} onChange={(v) => run(c, v ? 'enable' : 'disable')} label={<span className="sr">{c.enabled ? 'Switch off' : 'Switch on'}</span>} />
                    <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${c.name}`} onClick={() => setQuery({ edit: c.id })} />
                    <Button size="sm" variant="quiet" icon="trash" aria-label={`Remove ${c.name}`} loading={busy === c.id} onClick={() => run(c, 'delete')} />
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

function CampaignForm({ c, categories, onClose }) {
  const { toast, fail } = useUi();
  const isNew = !c.id;
  const [f, setF] = useState({ name: c.name || '', type: c.type || 'percent', value: c.value ?? '', start: toInputDate(c.start), end: toInputDate(c.end), productIds: c.productIds || [], categoryIds: c.categoryIds || [] });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, value: Number(f.value), start: fromInputDate(f.start), end: fromInputDate(f.end) };
      const r = isNew ? await api.post('/campaigns', body) : await api.put(`/campaigns/${c.id}`, body);
      changed('offers');
      toast(`“${r.name}” is ${isNew ? 'live' : 'updated'} on ${num(r.applied.length)} product${r.applied.length === 1 ? '' : 's'}`);
      onClose();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const example = Number(f.value) > 0 ? (f.type === 'percent' ? 100 * (1 - Number(f.value) / 100) : Math.max(0, 100 - Number(f.value))) : null;
  return (
    <Drawer wide title={isNew ? 'Create offer' : `Edit “${c.name}”`} hud={isNew ? 'Campaign' : `${c.enabled ? 'Running on' : 'Off ·'} ${num(c.applied?.length || 0)} products`} onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" loading={busy} onClick={save} disabled={!f.name.trim() || !(Number(f.value) > 0) || !(f.productIds.length || f.categoryIds.length)}>{isNew ? 'Start offer' : 'Save and re-apply'}</Button></>}>
      <Field label="Name" hint="Only you see this."><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Back to school headsets" autoFocus /></Field>
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
      <Field label="Categories and brands" hint="Every product inside them (including subcategories) gets the discount.">
        <CategoryPicker categories={categories} value={f.categoryIds} onChange={set('categoryIds')} maxHeight={220} />
      </Field>
      <Field label="Individual products"><ProductPicker value={f.productIds} onChange={set('productIds')} /></Field>
      <Notice icon="info">Each product gets a real WooCommerce sale price, so the shop, cart and checkout all show it. Products without a regular price, or already on a deeper sale, are left alone. Switching the offer off restores the previous prices.</Notice>
    </Drawer>
  );
}

/* ── coupons ─────────────────────────────────────────────────────────── */
function Coupons({ list }) {
  const { toast, fail } = useUi();
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  const toggle = async (c, on) => {
    setBusy(c.id);
    try { await api.put(`/coupons/${c.id}`, { status: on ? 'publish' : 'draft' }); changed('offers'); toast(on ? `${c.code.toUpperCase()} works again` : `${c.code.toUpperCase()} is disabled`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const trash = async (c) => {
    setBusy(c.id);
    try {
      await api.post(`/coupons/${c.id}/trash`); changed('offers');
      toast(`Moved ${c.code.toUpperCase()} to the trash`, { undo: async () => { await api.post(`/coupons/${c.id}/restore`).catch(fail); changed('offers'); } });
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
              const expired = c.date_expires && t(c.date_expires) < now();
              return (
                <tr key={c.id} className="clickable" onClick={() => setQuery({ edit: c.id })}>
                  <td><div className="cell-main"><span className="coupon-code">{c.code.toUpperCase()}</span>{c.description && <small className="clamp1" style={{ maxWidth: 220 }}>{c.description}</small>}</div></td>
                  <td data-label="Discount">{couponOff(c)}{Number(c.minimum_amount) > 0 && <small className="muted" style={{ display: 'block', fontSize: 11.5 }}>orders over {money(c.minimum_amount)}</small>}</td>
                  <td data-label="Used" className="mono">{num(c.usage_count)}{c.usage_limit ? <span className="muted"> / {num(c.usage_limit)}</span> : ''}</td>
                  <td data-label="Expires" className="t2" style={{ fontSize: 12.5 }}>{c.date_expires ? day(c.date_expires) : 'Never'}</td>
                  <td data-label="Status">{expired ? <Chip tone="muted">Expired</Chip> : c.status === 'publish' ? <Chip tone="green" led>Active</Chip> : <Chip tone="muted">Disabled</Chip>}</td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Toggle checked={c.status === 'publish'} disabled={busy === c.id} onChange={(v) => toggle(c, v)} label={<span className="sr">{c.status === 'publish' ? 'Disable' : 'Enable'}</span>} />
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
    code: c.code || '', discount_type: c.discount_type || 'percent', amount: c.amount ? String(Number(c.amount)) : '', description: c.description || '',
    date_expires: c.date_expires ? String(c.date_expires).slice(0, 10) : '', minimum_amount: Number(c.minimum_amount) > 0 ? String(Number(c.minimum_amount)) : '',
    usage_limit: c.usage_limit ?? '', usage_limit_per_user: c.usage_limit_per_user ?? '', individual_use: !!c.individual_use, free_shipping: !!c.free_shipping,
    product_ids: c.product_ids || [], product_categories: c.product_categories || [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, code: f.code.trim().toLowerCase(), date_expires: f.date_expires ? `${f.date_expires}T00:00:00` : null, usage_limit: f.usage_limit === '' ? null : Number(f.usage_limit), usage_limit_per_user: f.usage_limit_per_user === '' ? null : Number(f.usage_limit_per_user) };
      const r = isNew ? await api.post('/coupons', body) : await api.put(`/coupons/${c.id}`, body);
      changed('offers');
      toast(isNew ? `Coupon ${r.code.toUpperCase()} is ready to use` : `Saved ${r.code.toUpperCase()}`);
      onClose();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const suggest = () => setF((x) => ({ ...x, code: `DMD${Math.random().toString(36).slice(2, 7).toUpperCase()}` }));
  return (
    <Drawer wide title={isNew ? 'Create coupon' : `Edit ${c.code.toUpperCase()}`} hud={isNew ? 'Coupon' : `Used ${num(c.usage_count)} times`} onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" loading={busy} onClick={save} disabled={f.code.trim().length < 3 || !(Number(f.amount) > 0)}>{isNew ? 'Create coupon' : 'Save'}</Button></>}>
      <Field label="Code" hint="What buyers type at checkout. Letters, numbers, - and _ only.">
        <div className="row"><input className="input mono grow" style={{ textTransform: 'uppercase' }} value={f.code} onChange={set('code')} placeholder="e.g. GAMER10" autoFocus={isNew} />{isNew && <Button icon="sparkle" onClick={suggest}>Suggest</Button>}</div>
      </Field>
      <div className="grid-2">
        <Field label="Type">
          <select className="select" value={f.discount_type} onChange={set('discount_type')}>
            <option value="percent">Percent off the cart</option><option value="fixed_cart">Fixed amount off the cart</option><option value="fixed_product">Fixed amount off each item</option>
          </select>
        </Field>
        <Field label="Amount"><span className="input-affix"><span>{f.discount_type === 'percent' ? '%' : '$'}</span><input className="input mono" inputMode="decimal" value={f.amount} onChange={set('amount')} /></span></Field>
      </div>
      <Field label="Note to self"><input className="input" value={f.description} onChange={set('description')} placeholder="e.g. Instagram giveaway, October" /></Field>
      <div className="grid-3">
        <Field label="Expires on" hint="Stops working at 00:00 that day"><input className="input" type="date" value={f.date_expires} onChange={set('date_expires')} /></Field>
        <Field label="Minimum spend"><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={f.minimum_amount} onChange={set('minimum_amount')} placeholder="none" /></span></Field>
        <Field label="Total uses"><input className="input mono" type="number" min="0" value={f.usage_limit} onChange={set('usage_limit')} placeholder="unlimited" /></Field>
      </div>
      <div className="grid-2">
        <Field label="Uses per buyer"><input className="input mono" type="number" min="0" value={f.usage_limit_per_user} onChange={set('usage_limit_per_user')} placeholder="unlimited" /></Field>
        <div className="stack" style={{ gap: 10, alignContent: 'end', paddingBottom: 8 }}>
          <label className="row" style={{ cursor: 'pointer' }}><Check on={f.individual_use} onChange={set('individual_use')} label="Can't combine" /><span className="t2" style={{ fontSize: 13 }}>Can’t be combined with other coupons</span></label>
          <label className="row" style={{ cursor: 'pointer' }}><Check on={f.free_shipping} onChange={set('free_shipping')} label="Free shipping" /><span className="t2" style={{ fontSize: 13 }}>Also gives free delivery</span></label>
        </div>
      </div>
      <Field label="Only for these products" hint="Leave empty to allow the whole store."><ProductPicker value={f.product_ids} onChange={set('product_ids')} /></Field>
      <Field label="Only for these categories"><CategoryPicker categories={categories} value={f.product_categories} onChange={set('product_categories')} maxHeight={200} /></Field>
    </Drawer>
  );
}

/* ── products on sale ────────────────────────────────────────────────── */
function Sales({ list, campaigns }) {
  const { toast, fail, confirm } = useUi();
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  const names = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const end = async (p) => {
    if (p.campaign && !(await confirm({ title: 'End this sale price?', text: `It was set by the “${names[p.campaign]}” campaign. Only this product changes.`, confirmLabel: 'End sale' }))) return;
    setBusy(p.id);
    try { await api.put(`/products/${p.id}`, { sale_price: '', date_on_sale_from: null, date_on_sale_to: null }); changed('offers'); toast(`${p.name} is back to ${money(p.regular_price)}`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const rows = list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (1 - b.sale_price / b.regular_price) - (1 - a.sale_price / a.regular_price));
  if (!list.length) return <div className="surface"><Empty icon="percent" title="Nothing is on sale">Set a sale price on a product, or start a campaign for a whole category.</Empty></div>;
  return (
    <>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Find a product" /></div>
      <div className="surface">
        <table className="table cards">
          <thead><tr><th>Product</th><th className="right">Price</th><th>Off</th><th>Schedule</th><th>Source</th><th className="shrink" /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const pctOff = Number(p.regular_price) > 0 ? Math.round((1 - Number(p.sale_price) / Number(p.regular_price)) * 100) : 0;
              const scheduled = p.date_on_sale_from && t(p.date_on_sale_from) > now();
              return (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
                  <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b>{p.name}</b><small>{p.status !== 'publish' ? `${p.status} · ` : ''}{p.sku || `ID ${p.id}`}</small></div></div></td>
                  <td className="right" data-label="Price"><b className="num" style={{ color: 'var(--coral)' }}>{money(p.sale_price)}</b> <del className="muted" style={{ fontSize: 12 }}>{money(p.regular_price)}</del></td>
                  <td data-label="Off"><Chip tone="coral">−{pctOff}%</Chip></td>
                  <td data-label="Schedule" className="t2" style={{ fontSize: 12.5 }}>{scheduled ? <Chip tone="blue">Starts {day(p.date_on_sale_from)}</Chip> : p.date_on_sale_to ? `Ends ${day(p.date_on_sale_to)}` : 'No end date'}</td>
                  <td data-label="Source">{p.campaign ? <a className="linkish" href={`#/offers?edit=${p.campaign}`} onClick={(e) => e.stopPropagation()}>{names[p.campaign] || 'Campaign'}</a> : <span className="muted">Set by hand</span>}</td>
                  <td className="shrink" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="quiet" icon="close" loading={busy === p.id} onClick={() => end(p)}>End sale</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
