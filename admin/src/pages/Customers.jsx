import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, day, money, num } from '../lib/format.js';
import { Avatar, Button, Chip, Empty, Field, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, StatusChip, Tabs, Thumb, useUi } from '../ui/kit.jsx';

const nameOf = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim();
const profileLink = (c) => (c.guest ? `/customers/guest/${encodeURIComponent(c.email || c.key)}` : `/customers/${c.id}`);

export function CustomersPage({ query }) {
  const type = query.get('type') || 'registered';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ type, page: query.get('page') || '1' });
  if (query.get('q')) params.set('search', query.get('q'));
  const { data, error, loading } = useApi(`/customers?${params}`);
  return (
    <>
      <PageHeader hud={<><span className="led blue" />Sales</>} title="Buyers" text="Everyone who has an account or has ordered as a guest, with what they have bought." />
      <div className="toolbar">
        <Tabs label="Buyer type" value={type} onChange={(v) => setQuery({ type: v === 'registered' ? null : v, page: null })} items={[{ value: 'registered', label: 'With an account' }, { value: 'guest', label: 'Guest checkouts' }]} />
        <SearchBox value={search} onChange={setSearch} placeholder="Name, email or phone" />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? <Empty icon="users" title="No buyers found">{query.get('q') ? 'Try another search.' : 'Buyers appear here after they sign up or order.'}</Empty> : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Buyer</th><th>Phone</th><th>City</th><th className="right">Orders</th><th className="right">Spent</th><th>Last order</th>{type === 'registered' && <th>Joined</th>}</tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id || c.key} className="clickable" onClick={() => navigate(profileLink(c))}>
                    <td><div className="cell-main"><Avatar name={c.name} /><div style={{ minWidth: 0 }}><b>{c.name || 'No name'}</b><small>{c.email}</small></div></div></td>
                    <td data-label="Phone" className="mono t2" style={{ fontSize: 12.5 }}>{c.phone || '—'}</td>
                    <td data-label="City" className="t2">{c.city || '—'}</td>
                    <td className="right mono" data-label="Orders">{num(c.orders)}</td>
                    <td className="right" data-label="Spent"><b className="num">{money(c.spent, true)}</b></td>
                    <td data-label="Last order" className="muted mono" style={{ fontSize: 11.5 }}>{c.last ? ago(c.last) : 'Never'}</td>
                    {type === 'registered' && <td data-label="Joined" className="muted mono" style={{ fontSize: 11.5 }}>{day(c.date_created)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun={type === 'guest' ? 'guests' : 'buyers'} onPage={(n) => setQuery({ page: n })} />}
      </div>
      {type === 'guest' && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Guests are grouped by email from the last 190 days of orders.</p>}
    </>
  );
}

const ADDRESS = [['first_name', 'First name'], ['last_name', 'Last name'], ['company', 'Company'], ['address_1', 'Address'], ['address_2', 'Address line 2'], ['city', 'City'], ['state', 'Region'], ['postcode', 'Postcode'], ['country', 'Country code']];
function AddressFields({ value = {}, onChange, contact }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid-2">
      {ADDRESS.map(([k, label]) => <Field key={k} label={label}><input className="input" value={value[k] || ''} onChange={set(k)} maxLength={k === 'country' ? 2 : undefined} style={k === 'country' ? { textTransform: 'uppercase' } : undefined} /></Field>)}
      {contact && <Field label="Phone"><input className="input" type="tel" value={value.phone || ''} onChange={set('phone')} /></Field>}
    </div>
  );
}

export function CustomerProfile({ params, session }) {
  const { toast, fail } = useUi();
  const guest = !!params.email;
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get(guest ? `/customers/guest/${encodeURIComponent(params.email)}` : `/customers/${params.id}`).then((r) => {
      setC(r);
      const f = { first_name: r.first_name || '', last_name: r.last_name || '', email: r.email || '', billing: { ...r.billing }, shipping: { ...r.shipping } };
      setForm(f); setInitial(f);
    }).catch(setErr);
  }, [params.id, params.email, guest]);
  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!c) return <SkeletonRows rows={8} />;
  const name = nameOf(c) || c.username || c.email;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const paid = c.orders.filter((o) => ['processing', 'completed', 'on-hold'].includes(o.status));
  const last = [...c.orders].sort((a, b) => b.date_created.localeCompare(a.date_created))[0];
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/customers/${c.id}`, form);
      const f = { first_name: r.first_name || '', last_name: r.last_name || '', email: r.email || '', billing: { ...r.billing }, shipping: { ...r.shipping } };
      setC((x) => ({ ...x, ...r, orders: x.orders, spent: x.spent })); setForm(f); setInitial(f);
      changed('customers'); toast(`Saved ${nameOf(r) || r.email}’s details`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const copyShipping = () => setForm((f) => ({ ...f, shipping: { ...f.shipping, ...Object.fromEntries(ADDRESS.map(([k]) => [k, f.billing[k] || ''])) } }));

  return (
    <>
      <PageHeader crumbs={[{ label: 'Buyers', to: guest ? '#/customers?type=guest' : '#/customers' }, { label: guest ? 'Guest' : `#${c.id}` }]} title={name}
        text={guest ? 'Ordered without an account. Details come from their latest order.' : `Customer since ${day(c.date_created)}${c.username ? ` · username ${c.username}` : ''}`}
        actions={<>{c.email && <a className="btn" href={`mailto:${c.email}`}><Icon name="mail" />Email</a>}{!guest && session.capabilities.wpAdmin && <a className="btn quiet" href={`${session.capabilities.wpAdmin}user-edit.php?user_id=${c.id}`} target="_blank" rel="noreferrer"><Icon name="external" />WordPress account</a>}</>} />
      <div className="split">
        <div className="stack">
          <section className="surface">
            <div className="surface-head"><h3>Order history</h3>{!guest && <a className="btn sm quiet" href={`#/orders?customer=${c.id}`}>In Orders<Icon name="arrow" /></a>}</div>
            {c.orders.length ? (
              <table className="table cards">
                <thead><tr><th>Order</th><th>Items</th><th className="right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {[...c.orders].sort((a, b) => b.date_created.localeCompare(a.date_created)).map((o) => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td><b className="mono">#{o.number}</b><small className="muted" style={{ display: 'block', fontSize: 11.5 }}>{day(o.date_created)}</small></td>
                      <td data-label="Items"><span className="row" style={{ gap: 8 }}><span className="stack-thumbs">{o.items.slice(0, 3).map((l, i) => <Thumb key={i} src={l.image} />)}</span><span className="clamp1 muted" style={{ fontSize: 12, maxWidth: 260 }}>{o.items.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span></span></td>
                      <td className="right" data-label="Total"><b className="num">{money(o.total)}</b></td>
                      <td data-label="Status"><StatusChip status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty icon="receipt" title="No orders yet">This buyer has an account but hasn’t ordered.</Empty>}
          </section>

          {!guest && form && (
            <>
              <section className="surface">
                <div className="surface-head"><h3>Account details</h3></div>
                <div className="surface-body grid-3">
                  <Field label="First name"><input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
                  <Field label="Last name"><input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
                  <Field label="Email (sign-in)"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                </div>
              </section>
              <section className="surface">
                <div className="surface-head"><h3>Billing address</h3></div>
                <div className="surface-body stack">
                  <AddressFields value={form.billing} contact onChange={(billing) => setForm({ ...form, billing })} />
                  <Field label="Billing email"><input className="input" type="email" value={form.billing.email || ''} onChange={(e) => setForm({ ...form, billing: { ...form.billing, email: e.target.value } })} /></Field>
                </div>
              </section>
              <section className="surface">
                <div className="surface-head"><h3>Delivery address</h3><Button size="sm" variant="quiet" icon="undo" onClick={copyShipping}>Same as billing</Button></div>
                <div className="surface-body"><AddressFields value={form.shipping} contact onChange={(shipping) => setForm({ ...form, shipping })} /></div>
              </section>
              {dirty && (
                <div className="savebar">
                  <span className="dirty-dot" /><span className="t2">Unsaved changes</span><span className="grow" />
                  <Button variant="quiet" onClick={() => setForm(initial)}>Discard</Button>
                  <Button variant="primary" icon="check" loading={saving} onClick={save}>Save buyer</Button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="stack sticky-col">
          <section className="surface">
            <div className="surface-body stack" style={{ gap: 14 }}>
              <div className="row"><Avatar name={name} size="lg" /><div style={{ minWidth: 0 }}><h3 style={{ fontSize: 17 }}>{name}</h3>
                {guest ? <Chip tone="muted">Guest · no account</Chip> : c.is_paying_customer ? <Chip tone="green" led>Paying customer</Chip> : <Chip tone="blue" led>Registered</Chip>}</div></div>
              <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
                {c.email && <a className="row" style={{ gap: 8 }} href={`mailto:${c.email}`}><Icon name="mail" size={15} className="muted" /><span className="clamp1">{c.email}</span></a>}
                {c.billing?.phone && <a className="row" style={{ gap: 8 }} href={`tel:${c.billing.phone}`}><Icon name="phone" size={15} className="muted" />{c.billing.phone}</a>}
                {(c.shipping?.city || c.billing?.city) && <span className="row" style={{ gap: 8 }}><Icon name="pin" size={15} className="muted" />{[c.shipping?.address_1 || c.billing?.address_1, c.shipping?.city || c.billing?.city].filter(Boolean).join(', ')}</span>}
              </div>
              <div className="trio mini">
                <div><b className="num">{num(c.orders.length)}</b><span className="label">Orders</span></div>
                <div><b className="num">{money(c.spent, true)}</b><span className="label">Spent</span></div>
                <div><b className="num">{paid.length ? money(c.spent / paid.length, true) : '—'}</b><span className="label">Avg</span></div>
              </div>
              {last && <span className="muted" style={{ fontSize: 12.5 }}>Last order {ago(last.date_created)} · <a className="linkish" href={`#/orders/${last.id}`}>#{last.number}</a></span>}
            </div>
          </section>
          <Notice icon="lock">{guest
            ? 'Guests have no account to manage. If they sign up with the same email, WooCommerce links future orders to the account.'
            : 'Passwords, blocking an account and deleting it are WordPress user settings, not WooCommerce ones, so they stay in WordPress → Users.'}</Notice>
        </aside>
      </div>
    </>
  );
}
