import { useEffect, useMemo, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, day, money, num } from '../lib/format.js';
import { Avatar, Button, Chip, Empty, Field, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, StatusChip, Tabs, Thumb, useUi } from '../ui/kit.jsx';

const profileLink = (c, guest) => (guest ? `/customers/guest/${encodeURIComponent(c.email)}` : `/customers/${c.id}`);
const PAID = ['processing', 'completed', 'on_hold'];

export function CustomersPage({ query }) {
  const type = query.get('type') || 'registered';
  const guest = type === 'guest';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ type, page: query.get('page') || '1' });
  if (query.get('q')) params.set('q', query.get('q'));
  const { data: raw, error, loading } = useApi(`/customers?${params}`);
  const data = useMemo(() => (raw ? paged(raw) : null), [raw]);
  return (
    <>
      <PageHeader hud={<><span className="led blue" />Sales</>} title="Buyers" text="Everyone who has an account or has ordered as a guest, with what they have bought." />
      <div className="toolbar">
        <Tabs label="Buyer type" value={type} onChange={(v) => setQuery({ type: v === 'registered' ? null : v, page: null })} items={[{ value: 'registered', label: 'With an account' }, { value: 'guest', label: 'Guest checkouts', count: raw?.meta?.guests }]} />
        <SearchBox value={search} onChange={setSearch} placeholder="Name, email or phone" />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? <Empty icon="users" title="No buyers found">{query.get('q') ? 'Try another search.' : 'Buyers appear here after they sign up or order.'}</Empty> : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Buyer</th><th>Phone</th>{guest && <th>City</th>}<th className="right">Orders</th><th className="right">Spent</th><th>Last order</th>{!guest && <th>Joined</th>}</tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id || c.email} className="clickable" onClick={() => navigate(profileLink(c, guest))}>
                    <td><div className="cell-main"><Avatar name={c.name} /><div style={{ minWidth: 0 }}><b>{c.name || 'No name'}{!guest && !c.has_password && <Chip tone="amber">No password yet</Chip>}</b><small>{c.email}</small></div></div></td>
                    <td data-label="Phone" className="mono t2" style={{ fontSize: 12.5 }}>{c.phone || '—'}</td>
                    {guest && <td data-label="City" className="t2">{c.city || '—'}</td>}
                    <td className="right mono" data-label="Orders">{num(c.orders)}</td>
                    <td className="right" data-label="Spent"><b className="num">{money(c.spent, true)}</b></td>
                    <td data-label="Last order" className="muted mono" style={{ fontSize: 11.5 }}>{c.last_order_at ? ago(c.last_order_at) : 'Never'}</td>
                    {!guest && <td data-label="Joined" className="muted mono" style={{ fontSize: 11.5 }}>{day(c.member_since)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun={guest ? 'guests' : 'buyers'} onPage={(n) => setQuery({ page: n })} />}
      </div>
      {!guest && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>“No password yet”: accounts brought over from the old store. They choose a password with “Forgot password” on the sign-in page.</p>}
    </>
  );
}

const fromCustomer = (r) => ({ first_name: r.first_name || '', last_name: r.last_name || '', email: r.email || '', phone: r.phone || '' });

export function CustomerProfile({ params }) {
  const { toast, fail } = useUi();
  const guest = !!params.email;
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get(guest ? `/customers/guest?email=${encodeURIComponent(params.email)}` : `/customers/${params.id}`).then(({ data: r }) => {
      setC(r);
      const f = fromCustomer(r); setForm(f); setInitial(f);
    }).catch(setErr);
  }, [params.id, params.email, guest]);
  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!c) return <SkeletonRows rows={8} />;
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const orders = c.orders || [];
  const paid = orders.filter((o) => PAID.includes(o.status));
  const last = orders[0];
  const save = async () => {
    setSaving(true);
    try {
      const { data: r } = await api.put(`/customers/${c.id}`, { ...form, phone: form.phone.trim() || null });
      setC(r); const f = fromCustomer(r); setForm(f); setInitial(f);
      changed('customers'); toast(`Saved ${`${r.first_name} ${r.last_name}`.trim() || r.email}’s details`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader crumbs={[{ label: 'Buyers', to: guest ? '#/customers?type=guest' : '#/customers' }, { label: guest ? 'Guest' : `#${c.id}` }]} title={name}
        text={guest ? 'Ordered without an account. Details come from their latest order.' : `Customer since ${day(c.member_since)}${c.last_login_at ? ` · last signed in ${ago(c.last_login_at)}` : ''}`}
        actions={c.email && <a className="btn" href={`mailto:${c.email}`}><Icon name="mail" />Email</a>} />
      <div className="split">
        <div className="stack">
          <section className="surface">
            <div className="surface-head"><h3>Order history</h3><a className="btn sm quiet" href={guest ? `#/orders?email=${encodeURIComponent(c.email)}` : `#/orders?customer=${c.id}`}>In Orders<Icon name="arrow" /></a></div>
            {orders.length ? (
              <table className="table cards">
                <thead><tr><th>Order</th><th>Items</th><th className="right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td><b className="mono">#{o.number}</b><small className="muted" style={{ display: 'block', fontSize: 11.5 }}>{day(o.placed_at)}</small></td>
                      <td data-label="Items"><span className="row" style={{ gap: 8 }}><span className="stack-thumbs">{o.items.slice(0, 3).map((l, i) => <Thumb key={i} src={l.image_url} />)}</span><span className="clamp1 muted" style={{ fontSize: 12, maxWidth: 260 }}>{o.items.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span></span></td>
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
                <div className="surface-body grid-2">
                  <Field label="First name"><input className="input" value={form.first_name} onChange={set('first_name')} /></Field>
                  <Field label="Last name"><input className="input" value={form.last_name} onChange={set('last_name')} /></Field>
                  <Field label="Email (sign-in)"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
                  <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={set('phone')} /></Field>
                </div>
              </section>
              <section className="surface">
                <div className="surface-head"><h3>Saved addresses</h3><span className="hud">{num(c.addresses?.length || 0)}</span></div>
                <ul className="ledger">
                  {(c.addresses || []).map((a) => (
                    <li key={a.id} className="mini-row">
                      <Icon name="pin" size={15} className="muted" />
                      <span className="grow"><b style={{ fontWeight: 600 }}>{a.label || `${a.first_name} ${a.last_name}`}</b> {a.is_default && <Chip tone="blue">Default</Chip>}<small className="muted" style={{ display: 'block', fontSize: 12 }}>{a.summary} · {a.phone}</small></span>
                    </li>
                  ))}
                  {!c.addresses?.length && <li className="muted" style={{ padding: 14 }}>No saved addresses. Buyers manage these from their account.</li>}
                </ul>
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
                {guest ? <Chip tone="muted">Guest · no account</Chip> : paid.length ? <Chip tone="green" led>Paying customer</Chip> : <Chip tone="blue" led>Registered</Chip>}</div></div>
              <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
                {c.email && <a className="row" style={{ gap: 8 }} href={`mailto:${c.email}`}><Icon name="mail" size={15} className="muted" /><span className="clamp1">{c.email}</span></a>}
                {c.phone && <a className="row" style={{ gap: 8 }} href={`tel:${c.phone}`}><Icon name="phone" size={15} className="muted" />{c.phone}</a>}
                {c.city && <span className="row" style={{ gap: 8 }}><Icon name="pin" size={15} className="muted" />{c.city}</span>}
              </div>
              <div className="trio mini">
                <div><b className="num">{num(orders.length)}</b><span className="label">Orders</span></div>
                <div><b className="num">{money(c.spent, true)}</b><span className="label">Spent</span></div>
                <div><b className="num">{paid.length ? money(c.spent / paid.length, true) : '—'}</b><span className="label">Avg</span></div>
              </div>
              {last && <span className="muted" style={{ fontSize: 12.5 }}>Last order {ago(last.placed_at)} · <a className="linkish" href={`#/orders/${last.id}`}>#{last.number}</a></span>}
              {!guest && <span className="muted" style={{ fontSize: 12.5 }}>{num(c.wishlist_count)} saved product{c.wishlist_count === 1 ? '' : 's'}{c.marketing_opt_in ? ' · agreed to marketing emails' : ''}</span>}
            </div>
          </section>
          <Notice icon="lock">{guest
            ? `Guests have no account. ${c.has_account ? 'An account with this email exists now; its own orders are on its profile.' : 'If they sign up with this email, future orders go to that account.'}`
            : c.has_password ? 'Buyers choose and reset their own passwords. You can correct their name, email and phone here.' : 'This account came from the old store and has no password yet. The buyer sets one with “Forgot password”.'}</Notice>
        </aside>
      </div>
    </>
  );
}
