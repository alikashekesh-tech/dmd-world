import { Fragment, useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, dateTime, day, money, num, stripHtml, STATUS, OWNER_STATUSES } from '../lib/format.js';
import { Avatar, Button, Chip, Empty, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, StatusChip, StatusSelect, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const BUYER_TAG = '[Buyer message] '; // written by the storefront when a buyer messages from their account
const TABS = ['any', 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];
const fullName = (a = {}) => `${a.first_name || ''} ${a.last_name || ''}`.trim();
const addressLines = (a = {}) => [fullName(a), a.company, a.address_1, a.address_2, [a.city, a.state, a.postcode].filter(Boolean).join(', '), a.country].filter(Boolean);

/** Change an order's status with a confirmation for cancelling and an undo for everything. */
export function useOrderStatus() {
  const { toast, fail, confirm } = useUi();
  return async (o, status, after) => {
    if (status === o.status) return null;
    if (status === 'cancelled' && !(await confirm({ title: `Cancel order #${o.number}?`, text: 'Its items go back into stock. You can change the status again later.', confirmLabel: 'Cancel order', danger: true }))) return null;
    try {
      const r = await api.put(`/orders/${o.id}/status`, { status });
      changed('orders');
      after?.(r);
      toast(`Order #${o.number} is now ${STATUS[status].label.toLowerCase()}`, { undo: async () => { try { const back = await api.put(`/orders/${o.id}/status`, { status: o.status }); changed('orders'); after?.(back); } catch (e) { fail(e); } } });
      return r;
    } catch (e) { fail(e); return null; }
  };
}

export function OrdersPage({ query }) {
  const status = query.get('status') || 'any';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ status, page: query.get('page') || '1', per: '20' });
  if (query.get('q')) params.set('search', query.get('q'));
  if (query.get('customer')) params.set('customer', query.get('customer'));
  const { data, error, loading, setData } = useApi(`/orders?${params}`);
  const setStatus = useOrderStatus();
  const [busy, setBusy] = useState(null);
  const totals = data?.totals || {};
  const all = TABS.slice(1).reduce((a, k) => a + (totals[k] || 0), 0);
  const change = async (o, v) => {
    setBusy(o.id);
    await setStatus(o, v, (r) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, status: r.status } : x)) })));
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className={`led ${totals.pending ? 'amber pulse' : 'green'}`} />Sales</>} title="Orders"
        text={totals.pending ? `${num(totals.pending)} pending order${totals.pending === 1 ? '' : 's'} need${totals.pending === 1 ? 's' : ''} you. Confirm them by moving them to Processing.` : 'Every order in the store, newest first.'} />
      <div className="toolbar">
        <Tabs label="Status" value={status} onChange={(v) => setQuery({ status: v === 'any' ? null : v, page: null })}
          items={TABS.filter((k) => k === 'any' || OWNER_STATUSES.includes(k) || totals[k]).map((k) => ({ value: k, label: k === 'any' ? 'All' : STATUS[k].label, count: k === 'any' ? all : totals[k] || 0, led: k === 'pending' && totals.pending ? 'amber' : undefined }))} />
      </div>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Order number, name, email or phone" />
        {query.get('customer') && <Chip tone="blue">Buyer #{query.get('customer')} <button type="button" aria-label="Clear buyer filter" onClick={() => setQuery({ customer: null, page: null })}><Icon name="close" size={12} /></button></Chip>}
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? (
          <Empty icon="receipt" title={status === 'pending' ? 'No pending orders' : 'No orders found'}>{status === 'pending' ? 'Everything has been dealt with.' : query.get('q') ? 'Try another search.' : 'New orders appear here as they come in.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards compact">
              <thead><tr><th>Order</th><th>Items</th><th className="right">Total</th><th>Payment</th><th>Status</th><th>Placed</th></tr></thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td><div className="cell-main"><Avatar name={o.name} /><div style={{ minWidth: 0 }}><b>#{o.number} · {o.name}{o.note && <Icon name="chat" size={13} style={{ marginLeft: 6, color: 'var(--blue)', verticalAlign: -2 }} />}</b><small>{[o.city, o.phone || o.email].filter(Boolean).join(' · ')}</small></div></div></td>
                    <td data-label="Items" className="hide-compact"><span className="row" style={{ gap: 8 }}><span className="stack-thumbs">{o.items.slice(0, 3).map((l, i) => <Thumb key={i} src={l.image} />)}</span><span className="muted" style={{ fontSize: 12, maxWidth: 200 }}><span className="clamp1">{o.items.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span></span></span></td>
                    <td className="right" data-label="Total"><b className="num">{money(o.total)}</b></td>
                    <td data-label="Payment" className="t2 hide-compact" style={{ fontSize: 12.5 }}>{o.payment || '—'}</td>
                    <td data-label="Status"><StatusSelect status={o.status} busy={busy === o.id} onChange={(v) => change(o, v)} /></td>
                    <td data-label="Placed" className="muted mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }} title={dateTime(o.date_created)}>{ago(o.date_created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="orders" onPage={(n) => setQuery({ page: n })} />}
      </div>
    </>
  );
}

/* ── order detail ────────────────────────────────────────────────────── */
export function OrderDetail({ params }) {
  const { toast, fail, confirm } = useUi();
  const [o, setO] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [toBuyer, setToBuyer] = useState(false);
  const setStatus = useOrderStatus();
  const load = () => api.get(`/orders/${params.id}`).then(setO).catch(setErr);
  useEffect(() => { load(); }, [params.id]); // eslint-disable-line

  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!o) return <SkeletonRows rows={8} />;
  const trashed = o.status === 'trash';
  const subtotal = o.line_items.reduce((a, l) => a + Number(l.subtotal), 0);
  const ship = o.shipping?.address_1 ? o.shipping : o.billing;
  const name = fullName(o.billing) || o.billing.email || 'Guest';
  const profile = o.customer_id ? `#/customers/${o.customer_id}` : o.billing.email ? `#/customers/guest/${encodeURIComponent(o.billing.email)}` : null;

  const change = async (v) => { setBusy(true); await setStatus(o, v, (r) => setO(r)); setBusy(false); };
  const addNote = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/orders/${o.id}/notes`, { note, toCustomer: toBuyer });
      toast(toBuyer ? `Sent to ${name}. WooCommerce emails it to ${o.billing.email}.` : 'Private note added');
      setNote(''); setToBuyer(false);
      await load();
      changed('orders');
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const trash = async () => {
    if (!(await confirm({ title: `Move order #${o.number} to the trash?`, text: 'It disappears from your order lists and reports. You can restore it from the trash.', confirmLabel: 'Move to trash', danger: true }))) return;
    try {
      await api.post(`/orders/${o.id}/trash`); changed('orders');
      toast(`Order #${o.number} moved to the trash`, { undo: async () => { await api.post(`/orders/${o.id}/restore`, { status: o.status }).catch(fail); changed('orders'); navigate(`/orders/${o.id}`); } });
      navigate('/orders');
    } catch (x) { fail(x); }
  };
  const restore = async () => { try { await api.post(`/orders/${o.id}/restore`, { status: 'on-hold' }); changed('orders'); toast('Restored as On hold. Set the right status next.'); load(); } catch (x) { fail(x); } };
  const copy = async (lines) => { try { await navigator.clipboard.writeText(lines.join('\n')); toast('Address copied'); } catch { fail(new Error('Copy is blocked in this browser.')); } };

  return (
    <>
      <PageHeader crumbs={[{ label: 'Orders', to: '#/orders' }, { label: `#${o.number}` }]} title={`Order #${o.number}`}
        text={`Placed ${dateTime(o.date_created)}${o.date_paid ? ` · paid ${dateTime(o.date_paid)}` : ''}${o.date_completed ? ` · completed ${day(o.date_completed)}` : ''}`}
        actions={!trashed && <><StatusSelect status={o.status} busy={busy} onChange={change} /><Button variant="quiet" icon="trash" onClick={trash}>Trash</Button></>} />
      {trashed && <div style={{ marginBottom: 14 }}><Notice tone="coral" icon="trash">This order is in the trash. <button className="linkish" onClick={restore}>Restore it</button> (it comes back as On hold).</Notice></div>}
      {o.status === 'pending' && <div style={{ marginBottom: 14 }}><Notice tone="amber" icon="clock">Waiting for payment or confirmation since {ago(o.date_created)}. Move it to <b>Processing</b> once it is confirmed, or <b>Cancelled</b> if it is not going ahead.</Notice></div>}

      <div className="split">
        <div className="stack">
          {o.customer_note && (
            <section className="surface buyer-note">
              <div className="surface-body row" style={{ alignItems: 'flex-start' }}>
                <Icon name="chat" />
                <div className="grow"><span className="label">Note from {o.billing.first_name || 'the buyer'}</span><p style={{ marginTop: 6, fontSize: 14.5 }}>“{o.customer_note}”</p></div>
                <a className="btn sm" href={`#/messages/${o.id}`}>Reply</a>
              </div>
            </section>
          )}
          <section className="surface">
            <div className="surface-head"><h3>Items</h3><span className="hud">{num(o.line_items.reduce((a, l) => a + l.quantity, 0))} units</span></div>
            <table className="table cards">
              <thead><tr><th>Product</th><th className="right">Price</th><th className="right">Qty</th><th className="right">Total</th></tr></thead>
              <tbody>
                {o.line_items.map((l) => (
                  <tr key={l.id}>
                    <td><div className="cell-main"><Thumb src={l.image?.src} /><div style={{ minWidth: 0 }}><b>{l.product_id ? <a href={`#/products/${l.product_id}`}>{l.name}</a> : l.name}</b><small>{l.sku ? `SKU ${l.sku}` : `Product ${l.product_id || '—'}`}{(l.meta_data || []).filter((m) => !String(m.key).startsWith('_')).map((m) => ` · ${m.display_key || m.key}: ${stripHtml(String(m.display_value ?? m.value))}`).join('')}</small></div></div></td>
                    <td className="right mono" data-label="Price">{money(l.price ?? Number(l.subtotal) / l.quantity)}</td>
                    <td className="right mono" data-label="Qty">×{l.quantity}</td>
                    <td className="right" data-label="Total"><b className="num">{money(l.total)}</b>{Number(l.subtotal) > Number(l.total) && <del className="muted mono" style={{ display: 'block', fontSize: 11 }}>{money(l.subtotal)}</del>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <dt>Subtotal</dt><dd>{money(subtotal)}</dd>
              {(o.coupon_lines || []).map((c) => <Fragment key={`c${c.id}`}><dt>Coupon <span className="coupon-code">{c.code.toUpperCase()}</span></dt><dd style={{ color: 'var(--coral)' }}>−{money(c.discount)}</dd></Fragment>)}
              {!(o.coupon_lines || []).length && Number(o.discount_total) > 0 && <><dt>Discount</dt><dd style={{ color: 'var(--coral)' }}>−{money(o.discount_total)}</dd></>}
              {(o.shipping_lines || []).map((s) => <Fragment key={`s${s.id}`}><dt>Delivery · {s.method_title}</dt><dd>{Number(s.total) ? money(s.total) : 'Free'}</dd></Fragment>)}
              {(o.fee_lines || []).map((f) => <Fragment key={`f${f.id}`}><dt>{f.name}</dt><dd>{money(f.total)}</dd></Fragment>)}
              {Number(o.total_tax) > 0 && <><dt>Tax</dt><dd>{money(o.total_tax)}</dd></>}
              <dt className="grand">Total</dt><dd className="grand">{money(o.total)}</dd>
            </dl>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Notes & history</h3><span className="hud">{num(o.notes.length)}</span></div>
            {!trashed && (
              <form className="surface-body stack" onSubmit={addNote} style={{ borderBottom: '1px solid var(--line)', gap: 10 }}>
                <textarea className="textarea" style={{ minHeight: 72 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={toBuyer ? `Message to ${o.billing.first_name || 'the buyer'}…` : 'Private note (only you see it)…'} aria-label="Note" />
                <div className="row wrap">
                  <Toggle checked={toBuyer} onChange={setToBuyer} label={toBuyer ? `Email it to ${o.billing.email || 'the buyer'}` : 'Send to the buyer'} />
                  <span className="grow" />
                  <Button type="submit" variant={toBuyer ? 'primary' : ''} icon={toBuyer ? 'send' : 'plus'} loading={busy} disabled={!note.trim()}>{toBuyer ? 'Send to buyer' : 'Add note'}</Button>
                </div>
              </form>
            )}
            <ul className="notes">
              {o.notes.map((nt) => {
                const fromBuyer = String(nt.note).startsWith(BUYER_TAG);
                return (
                  <li key={nt.id} className={fromBuyer ? 'from-buyer' : nt.customer_note ? 'to-buyer' : nt.author === 'system' || nt.author === 'WooCommerce' ? 'system' : ''}>
                    <span className="label">{fromBuyer ? <><Icon name="chat" size={12} />From buyer · their account</> : nt.customer_note ? <><Icon name="send" size={12} />To buyer</> : nt.author === 'system' || nt.author === 'WooCommerce' ? 'Store' : <><Icon name="lock" size={12} />Private · {nt.author}</>}<span className="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>· {dateTime(nt.date_created)}</span></span>
                    <p>{stripHtml(fromBuyer ? nt.note.slice(BUYER_TAG.length) : nt.note)}</p>
                  </li>
                );
              })}
              {!o.notes.length && <li className="muted">No notes yet.</li>}
            </ul>
          </section>
        </div>

        <aside className="stack sticky-col">
          <section className="surface">
            <div className="surface-body stack" style={{ gap: 12 }}>
              <div className="row"><Avatar name={name} size="lg" /><div style={{ minWidth: 0 }}><h3 style={{ fontSize: 17 }}>{name}</h3><span className="muted" style={{ fontSize: 12.5 }}>{o.customer_id ? 'Registered buyer' : 'Guest checkout'}</span></div></div>
              <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
                {o.billing.email && <a className="row" style={{ gap: 8 }} href={`mailto:${o.billing.email}`}><Icon name="mail" size={15} className="muted" /><span className="clamp1">{o.billing.email}</span></a>}
                {o.billing.phone && <a className="row" style={{ gap: 8 }} href={`tel:${o.billing.phone}`}><Icon name="phone" size={15} className="muted" />{o.billing.phone}</a>}
              </div>
              <div className="trio mini">
                <div><b className="num">{num(o.buyer.orders)}</b><span className="label">Orders</span></div>
                <div><b className="num">{money(o.buyer.spent, true)}</b><span className="label">Spent</span></div>
                <div><b className="num" style={{ fontSize: 14 }}>{new Date(o.buyer.first).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</b><span className="label">Since</span></div>
              </div>
              {profile && <a className="btn sm" href={profile}>Buyer profile<Icon name="arrow" /></a>}
            </div>
          </section>
          <section className="surface">
            <div className="surface-head"><h3><Icon name="truck" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Delivery</h3><Button size="sm" variant="quiet" icon="link" onClick={() => copy([...addressLines(ship), ship.phone || o.billing.phone].filter(Boolean))}>Copy</Button></div>
            <div className="surface-body address">{addressLines(ship).map((l, i) => <div key={i}>{l}</div>)}{!addressLines(ship).length && <span className="muted">No address given.</span>}
              {(o.shipping_lines || []).map((s) => <div key={s.id} className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>{s.method_title}</div>)}
            </div>
          </section>
          <section className="surface">
            <div className="surface-head"><h3><Icon name="card" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Payment</h3>{o.date_paid ? <Chip tone="green" led>Paid</Chip> : <Chip tone="amber" led>Not paid yet</Chip>}</div>
            <div className="surface-body stack" style={{ gap: 6, fontSize: 13.5 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Method</span><span>{o.payment_method_title || '—'}</span></div>
              {o.transaction_id && <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Reference</span><span className="mono">{o.transaction_id}</span></div>}
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Total</span><b className="num">{money(o.total)} <span className="muted mono" style={{ fontSize: 11 }}>{o.currency}</span></b></div>
            </div>
          </section>
          {addressLines(o.billing).join() !== addressLines(ship).join() && (
            <section className="surface">
              <div className="surface-head"><h3>Billing address</h3></div>
              <div className="surface-body address">{addressLines(o.billing).map((l, i) => <div key={i}>{l}</div>)}</div>
            </section>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Status now: <StatusChip status={o.status} /></p>
        </aside>
      </div>
    </>
  );
}

