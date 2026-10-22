import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, dateTime, day, money, num, STATUS, OWNER_STATUSES } from '../lib/format.js';
import { Avatar, Button, Chip, Empty, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, StatusChip, StatusSelect, Tabs, Thumb, Toggle, useUi } from '../ui/kit.jsx';

const TABS = ['any', 'pending', 'processing', 'on_hold', 'completed', 'cancelled', 'refunded', 'failed'];
const nameOf = (o) => o.customer_name || `${o.contact?.first_name || ''} ${o.contact?.last_name || ''}`.trim() || o.contact?.email || 'Guest';
const addressLines = (o) => (o.address ? [nameOf(o), o.address.street, [o.address.building && `Building ${o.address.building}`, o.address.floor && `Floor ${o.address.floor}`].filter(Boolean).join(', '), [o.address.area, o.address.city].filter(Boolean).join(', '), o.address.country, o.address.notes].filter(Boolean) : []);
const HISTORY_LABEL = { buyer: 'Buyer', admin: 'You', system: 'Store' };

/** Change an order's status with a confirmation for cancelling and an undo where the move can be reversed. */
export function useOrderStatus() {
  const { toast, fail, confirm } = useUi();
  return async (o, status, after) => {
    if (status === o.status) return null;
    if (status === 'cancelled' && !(await confirm({ title: `Cancel order #${o.number}?`, text: 'Its items go back into stock. You can reopen it later if stock allows.', confirmLabel: 'Cancel order', danger: true }))) return null;
    let restock;
    if (status === 'refunded') {
      const answer = await confirm({ title: `Refund order #${o.number}?`, text: 'The order is marked refunded. This can’t be undone.', confirmLabel: 'Refund order', danger: true,
        option: { label: 'Put the items back in stock (they came back and can be sold again)', checked: true } });
      if (!answer) return null;
      restock = answer.option;
    }
    try {
      const { data: r } = await api.put(`/orders/${o.id}/status`, restock === undefined ? { status } : { status, restock });
      changed('orders');
      after?.(r);
      const back = r.next_statuses?.includes(o.status);
      toast(`Order #${o.number} is now ${STATUS[status]?.label.toLowerCase() || status}`, back ? { undo: async () => { try { const { data: b } = await api.put(`/orders/${o.id}/status`, { status: o.status }); changed('orders'); after?.(b); } catch (e) { fail(e); } } } : undefined);
      return r;
    } catch (e) { fail(e); return null; }
  };
}

export function OrdersPage({ query }) {
  const status = query.get('status') || 'any';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ page: query.get('page') || '1', per_page: '20' });
  if (status !== 'any') params.set('status', status);
  for (const k of ['q', 'customer', 'email']) if (query.get(k)) params.set(k, query.get(k));
  const { data: raw, error, loading, setData } = useApi(`/orders?${params}`);
  const data = useMemo(() => (raw ? paged(raw) : null), [raw]);
  const setStatus = useOrderStatus();
  const [busy, setBusy] = useState(null);
  const totals = raw?.meta?.counts || {};
  const change = async (o, v) => {
    setBusy(o.id);
    await setStatus(o, v, (r) => setData((d) => ({ ...d, data: d.data.map((x) => (x.id === o.id ? { ...x, ...r } : x)) })));
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className={`led ${totals.pending ? 'amber pulse' : 'green'}`} />Sales</>} title="Orders"
        text={totals.pending ? `${num(totals.pending)} pending order${totals.pending === 1 ? '' : 's'} need${totals.pending === 1 ? 's' : ''} you. Confirm them by moving them to Processing.` : 'Every order in the store, newest first.'} />
      <div className="toolbar">
        <Tabs label="Status" value={status} onChange={(v) => setQuery({ status: v === 'any' ? null : v, page: null })}
          items={TABS.filter((k) => k === 'any' || OWNER_STATUSES.includes(k) || totals[k]).map((k) => ({ value: k, label: k === 'any' ? 'All' : STATUS[k].label, count: k === 'any' ? totals.all : totals[k] || 0, led: k === 'pending' && totals.pending ? 'amber' : undefined }))} />
      </div>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Order number, name, email or phone" />
        {query.get('customer') && <Chip tone="blue">Buyer #{query.get('customer')} <button type="button" aria-label="Clear buyer filter" onClick={() => setQuery({ customer: null, page: null })}><Icon name="close" size={12} /></button></Chip>}
        {query.get('email') && <Chip tone="blue">{query.get('email')} <button type="button" aria-label="Clear guest filter" onClick={() => setQuery({ email: null, page: null })}><Icon name="close" size={12} /></button></Chip>}
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
                    <td><div className="cell-main"><Avatar name={nameOf(o)} /><div style={{ minWidth: 0 }}><b>#{o.number} · {nameOf(o)}{o.customer_note && <Icon name="chat" size={13} style={{ marginLeft: 6, color: 'var(--blue)', verticalAlign: -2 }} />}</b><small>{[o.address?.city, o.contact?.phone || o.contact?.email].filter(Boolean).join(' · ')}</small></div></div></td>
                    <td data-label="Items" className="hide-compact"><span className="row" style={{ gap: 8 }}><span className="stack-thumbs">{o.items.slice(0, 3).map((l, i) => <Thumb key={i} src={l.image_url} />)}</span><span className="muted" style={{ fontSize: 12, maxWidth: 200 }}><span className="clamp1">{o.items.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span></span></span></td>
                    <td className="right" data-label="Total"><b className="num">{money(o.total)}</b></td>
                    <td data-label="Payment" className="t2 hide-compact" style={{ fontSize: 12.5 }}>{o.payment_method_label}{o.payment_status === 'paid' ? ' · paid' : ''}</td>
                    <td data-label="Status"><StatusSelect status={o.status} busy={busy === o.id} onChange={(v) => change(o, v)} /></td>
                    <td data-label="Placed" className="muted mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }} title={dateTime(o.placed_at)}>{ago(o.placed_at)}</td>
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
  const { toast, fail } = useUi();
  const [o, setO] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [toBuyer, setToBuyer] = useState(false);
  const setStatus = useOrderStatus();
  const load = () => api.get(`/orders/${params.id}`).then((r) => { setO(r.data); setBuyer(r.meta?.customer || null); }).catch(setErr);
  useEffect(() => { load(); }, [params.id]); // eslint-disable-line

  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!o) return <SkeletonRows rows={8} />;
  const name = nameOf(o);
  const profile = o.user_id ? `#/customers/${o.user_id}` : `#/customers/guest/${encodeURIComponent(o.contact.email)}`;

  const change = async (v) => { setBusy(true); await setStatus(o, v, (r) => setO(r)); setBusy(false); };
  const setPaid = async (payment) => {
    setBusy(true);
    try { const { data } = await api.put(`/orders/${o.id}/payment`, { payment_status: payment }); setO(data); changed('orders'); toast(payment === 'paid' ? 'Marked as paid' : 'Marked as not paid'); } catch (x) { fail(x); }
    setBusy(false);
  };
  const addNote = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (toBuyer) {
        await api.post('/conversations', { user_id: o.user_id, order_id: o.id, body: note });
        toast(`Sent to ${name}. They get an email and see it in their account.`);
      } else {
        const { data } = await api.post(`/orders/${o.id}/notes`, { note });
        setO(data);
        toast('Private note added');
      }
      setNote(''); setToBuyer(false);
      changed('orders');
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const copy = async (lines) => { try { await navigator.clipboard.writeText(lines.join('\n')); toast('Address copied'); } catch { fail(new Error('Copy is blocked in this browser.')); } };
  const lines = addressLines(o);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Orders', to: '#/orders' }, { label: `#${o.number}` }]} title={`Order #${o.number}`}
        text={`Placed ${dateTime(o.placed_at)}${o.cancelled_at ? ` · cancelled ${day(o.cancelled_at)}` : ''}`}
        actions={<StatusSelect status={o.status} busy={busy} onChange={change} />} />
      {o.status === 'pending' && <div style={{ marginBottom: 14 }}><Notice tone="amber" icon="clock">Waiting for confirmation since {ago(o.placed_at)}. Move it to <b>Processing</b> once it is confirmed, or <b>Cancelled</b> if it is not going ahead.</Notice></div>}

      <div className="split">
        <div className="stack">
          {o.customer_note && (
            <section className="surface buyer-note">
              <div className="surface-body row" style={{ alignItems: 'flex-start' }}>
                <Icon name="chat" />
                <div className="grow"><span className="label">Note from {o.contact.first_name || 'the buyer'}</span><p style={{ marginTop: 6, fontSize: 14.5 }}>“{o.customer_note}”</p></div>
                {o.user_id && <Button size="sm" onClick={() => setToBuyer(true)}>Reply</Button>}
              </div>
            </section>
          )}
          <section className="surface">
            <div className="surface-head"><h3>Items</h3><span className="hud">{num(o.item_count ?? o.items.reduce((a, l) => a + l.quantity, 0))} units</span></div>
            <table className="table cards">
              <thead><tr><th>Product</th><th className="right">Price</th><th className="right">Qty</th><th className="right">Total</th></tr></thead>
              <tbody>
                {o.items.map((l, i) => (
                  <tr key={`${l.product_id}-${i}`}>
                    <td><div className="cell-main"><Thumb src={l.image_url} /><div style={{ minWidth: 0 }}><b>{l.product_id ? <a href={`#/products/${l.product_id}`}>{l.name}</a> : l.name}</b><small>{l.sku ? `SKU ${l.sku}` : l.product_id ? `Product ${l.product_id}` : 'No longer in the catalog'}{l.unit_price < l.regular_price ? ` · was ${money(l.regular_price)}` : ''}</small></div></div></td>
                    <td className="right mono" data-label="Price">{money(l.unit_price)}</td>
                    <td className="right mono" data-label="Qty">×{l.quantity}</td>
                    <td className="right" data-label="Total"><b className="num">{money(l.line_total)}</b>{l.line_discount > 0 && <del className="muted mono" style={{ display: 'block', fontSize: 11 }}>{money(l.line_subtotal)}</del>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <dt>Subtotal</dt><dd>{money(o.subtotal)}</dd>
              {o.discount_total > 0 && <Fragment><dt>{o.coupon_code ? <>Coupon <span className="coupon-code">{o.coupon_code}</span></> : 'Discount'}</dt><dd style={{ color: 'var(--coral)' }}>−{money(o.discount_total)}</dd></Fragment>}
              <dt>{o.delivery_method_label}</dt><dd>{o.shipping_total > 0 ? money(o.shipping_total) : o.delivery_method === 'pickup' ? 'Free' : 'Confirmed with the buyer'}</dd>
              <dt className="grand">Total</dt><dd className="grand">{money(o.total)}</dd>
            </dl>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Notes & history</h3><span className="hud">{num(o.history?.length || 0)}</span></div>
            <form className="surface-body stack" onSubmit={addNote} style={{ borderBottom: '1px solid var(--line)', gap: 10 }}>
              <textarea className="textarea" style={{ minHeight: 72 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={toBuyer ? `Message to ${o.contact.first_name || 'the buyer'}…` : 'Private note (only you see it)…'} aria-label="Note" maxLength={toBuyer ? 2000 : 500} />
              <div className="row wrap">
                {o.user_id ? <Toggle checked={toBuyer} onChange={setToBuyer} label={toBuyer ? `Message ${o.contact.email} (email + their account)` : 'Send to the buyer'} />
                  : <span className="muted" style={{ fontSize: 12 }}>Guest checkout: reach them by phone or email.</span>}
                <span className="grow" />
                <Button type="submit" variant={toBuyer ? 'primary' : ''} icon={toBuyer ? 'send' : 'plus'} loading={busy} disabled={!note.trim()}>{toBuyer ? 'Send to buyer' : 'Add note'}</Button>
              </div>
            </form>
            <ul className="notes">
              {[...(o.history || [])].reverse().map((h, i) => (
                <li key={i} className={h.actor === 'system' ? 'system' : h.actor === 'buyer' ? 'from-buyer' : ''}>
                  <span className="label">
                    {h.to ? <>{HISTORY_LABEL[h.actor] || h.actor}{h.by ? ` (${h.by})` : ''} · {h.from ? `${STATUS[h.from]?.label || h.from} → ` : ''}{STATUS[h.to]?.label || h.to}</> : <><Icon name="lock" size={12} />Private · {h.by || HISTORY_LABEL[h.actor] || h.actor}</>}
                    <span className="muted" style={{ letterSpacing: 0, textTransform: 'none' }}> · {dateTime(h.at)}</span>
                  </span>
                  {h.note && <p>{h.note}</p>}
                </li>
              ))}
              {!o.history?.length && <li className="muted">No notes yet.</li>}
            </ul>
            {o.user_id && <div className="surface-body"><a className="linkish" href="#/messages">Conversations with buyers are in Messages</a></div>}
          </section>
        </div>

        <aside className="stack sticky-col">
          <section className="surface">
            <div className="surface-body stack" style={{ gap: 12 }}>
              <div className="row"><Avatar name={name} size="lg" /><div style={{ minWidth: 0 }}><h3 style={{ fontSize: 17 }}>{name}</h3><span className="muted" style={{ fontSize: 12.5 }}>{o.user_id ? 'Registered buyer' : 'Guest checkout'}</span></div></div>
              <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
                {o.contact.email && <a className="row" style={{ gap: 8 }} href={`mailto:${o.contact.email}`}><Icon name="mail" size={15} className="muted" /><span className="clamp1">{o.contact.email}</span></a>}
                {o.contact.phone && <a className="row" style={{ gap: 8 }} href={`tel:${o.contact.phone}`}><Icon name="phone" size={15} className="muted" />{o.contact.phone}</a>}
              </div>
              {buyer && (
                <div className="trio mini">
                  <div><b className="num">{num(buyer.orders)}</b><span className="label">Orders</span></div>
                  <div><b className="num">{money(buyer.spent, true)}</b><span className="label">Spent</span></div>
                  <div><b className="num" style={{ fontSize: 14 }}>{buyer.first_order_at ? new Date(buyer.first_order_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}</b><span className="label">Since</span></div>
                </div>
              )}
              <a className="btn sm" href={profile}>Buyer profile<Icon name="arrow" /></a>
            </div>
          </section>
          <section className="surface">
            <div className="surface-head"><h3><Icon name="truck" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{o.delivery_method_label}</h3>{lines.length > 0 && <Button size="sm" variant="quiet" icon="link" onClick={() => copy([...lines, o.contact.phone].filter(Boolean))}>Copy</Button>}</div>
            <div className="surface-body address">{lines.map((l, i) => <div key={i}>{l}</div>)}{!lines.length && <span className="muted">{o.delivery_method === 'pickup' ? 'Collects from the store.' : 'No address given.'}</span>}</div>
          </section>
          <section className="surface">
            <div className="surface-head"><h3><Icon name="card" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Payment</h3>{o.payment_status === 'paid' ? <Chip tone="green" led>Paid</Chip> : o.payment_status === 'refunded' ? <Chip tone="muted">Refunded</Chip> : <Chip tone="amber" led>Not paid yet</Chip>}</div>
            <div className="surface-body stack" style={{ gap: 6, fontSize: 13.5 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Method</span><span>{o.payment_method_label}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Total</span><b className="num">{money(o.total)} <span className="muted mono" style={{ fontSize: 11 }}>{o.currency}</span></b></div>
              {o.payment_status === 'unpaid' && <Button size="sm" icon="check" loading={busy} onClick={() => setPaid('paid')}>Mark as paid</Button>}
              {o.payment_status === 'paid' && o.status !== 'completed' && <Button size="sm" variant="quiet" loading={busy} onClick={() => setPaid('unpaid')}>Mark as not paid</Button>}
            </div>
          </section>
          <p className="muted" style={{ fontSize: 12 }}>Status now: <StatusChip status={o.status} /></p>
        </aside>
      </div>
    </>
  );
}
