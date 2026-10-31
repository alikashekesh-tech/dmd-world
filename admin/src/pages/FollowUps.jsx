import { useMemo, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, money, num } from '../lib/format.js';
import { Button, Chip, Empty, Notice, PageHeader, Pager, SkeletonRows, Tabs, useUi } from '../ui/kit.jsx';

/* Customers waiting to hear from the store: back-in-stock requests (by email or WhatsApp) and checkouts left
   unfinished by customers who asked for a reminder. Contact details are shown to the owner only. Nothing here sends
   a message by itself: "Open WhatsApp" opens a chat for the owner to send, and "Mark as told" only records it. */

const VIEWS = [['stock', 'Back in stock'], ['checkouts', 'Unfinished checkouts']];
const STOCK_TABS = [['waiting', 'Waiting'], ['notified', 'Told'], ['cancelled', 'Withdrawn']];
const CHECKOUT_TABS = [['all', 'All'], ['open', 'Waiting'], ['reminded', 'Reminded'], ['recovered', 'Ordered'], ['closed', 'Closed']];
const CHANNEL = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };
const STATE = { open: ['Waiting', 'amber'], reminded: ['Reminded', 'blue'], recovered: ['Ordered', 'green'], closed: ['Closed', 'muted'] };

function StockRequests({ query }) {
  const { toast, fail } = useUi();
  const status = query.get('status') || 'waiting';
  const params = new URLSearchParams({ status, page: query.get('page') || '1' });
  const { data: raw, error, loading } = useApi(`/stock-alerts/requests?${params}`);
  const data = useMemo(() => (raw ? paged(raw) : null), [raw]);
  const auto = raw?.meta?.automatic || {};
  const [busy, setBusy] = useState(null);

  const contacted = async (r) => {
    setBusy(r.id);
    try { await api.post(`/stock-alerts/${r.id}/contacted`); changed('stock'); toast('Marked as told'); } catch (e) { fail(e); }
    setBusy(null);
  };

  return (
    <>
      <div className="toolbar">
        <Tabs label="Request status" value={status} onChange={(v) => setQuery({ status: v === 'waiting' ? null : v, page: null })} items={STOCK_TABS.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      {!auto.whatsapp && status === 'waiting' && (
        <Notice tone="blue" icon="info">Email requests are sent automatically the moment stock comes back. WhatsApp requests wait here: no WhatsApp provider is connected yet, so tell those customers yourself with “Open WhatsApp”, then mark them as told.</Notice>
      )}
      <div className="surface" style={{ marginTop: 12 }}>
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? (
          <Empty icon="bell" title={status === 'waiting' ? 'Nobody is waiting' : 'Nothing here'}>{status === 'waiting' ? 'When customers ask to hear about a sold-out product, they appear here.' : 'Requests appear here once they’re answered or withdrawn.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Product</th><th>Customer</th><th>Asked</th><th>Status</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Product"><div className="cell-main"><div style={{ minWidth: 0 }}>
                      <b>{r.product ? <a href={`#/products/${r.product.id}`}>{r.product.name}</a> : 'A removed product'}</b>
                      <small>{r.variant ? r.variant.label : 'Any option'}{r.product?.sku ? ` · SKU ${r.product.sku}` : ''}</small>
                    </div></div></td>
                    <td data-label="Customer"><div className="stack" style={{ gap: 2 }}>
                      <span>{r.customer?.name ? <a className="linkish" href={`#/customers/${r.customer.id}`}>{r.customer.name}</a> : r.customer ? <a className="linkish" href={`#/customers/${r.customer.id}`}>Customer #{r.customer.id}</a> : 'Guest'}</span>
                      <small className="muted">{CHANNEL[r.channel] || r.channel} · {r.contact || '—'}</small>
                    </div></td>
                    <td data-label="Asked"><small>{ago(r.created_at)}</small></td>
                    <td data-label="Status">
                      {r.cancelled_at ? <Chip tone="muted">Withdrawn</Chip>
                        : r.notified_at ? <Chip tone="green">{r.notified_by === 'admin' ? 'Told by you' : 'Sent'} {ago(r.notified_at)}</Chip>
                        : r.available_now ? <Chip tone="amber" led>Back in stock</Chip> : <Chip tone="muted">Still sold out</Chip>}
                    </td>
                    <td className="right">
                      {!r.notified_at && !r.cancelled_at && (
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          {r.whatsapp_url && <a className="btn sm" href={r.whatsapp_url} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
                          <Button size="sm" icon="check" loading={busy === r.id} onClick={() => contacted(r)}>Mark as told</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="requests" onPage={(n) => setQuery({ page: n })} />}
      </div>
    </>
  );
}

function Checkouts({ query }) {
  const state = query.get('state') || 'all';
  const params = new URLSearchParams({ page: query.get('page') || '1' });
  if (state !== 'all') params.set('state', state);
  const { data: raw, error, loading } = useApi(`/checkout-recoveries?${params}`);
  const data = useMemo(() => (raw ? paged(raw) : null), [raw]);
  const meta = raw?.meta || {};
  const st = meta.stats || {};

  return (
    <>
      {raw && (meta.enabled
        ? <Notice tone="blue" icon="info">Customers who tick “remind me” at checkout get one email {num(meta.delay_minutes)} minutes after their last change, unless they order first. Change this in Settings.</Notice>
        : <Notice tone="amber" icon="alert">Checkout reminders are off, so customers aren’t offered them. Switch them on in <a className="linkish" href="#/settings">Settings</a>.</Notice>)}
      <div className="surface" style={{ margin: '12px 0' }}>
        <div className="kpis" style={{ borderTop: 0 }}>
          {[['Saved, last 30 days', num(st.saved)], ['Reminded', num(st.reminded)], ['Ordered after a reminder', num(st.recovered_after_reminder)], ['Value of those orders', money(st.recovered_revenue)]].map(([l, v]) => (
            <div key={l} className="kpi"><span className="label">{l}</span><b>{raw ? v : '—'}</b></div>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <Tabs label="Checkout state" value={state} onChange={(v) => setQuery({ state: v === 'all' ? null : v, page: null })} items={CHECKOUT_TABS.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? (
          <Empty icon="receipt" title="No unfinished checkouts">Only customers who ask for a reminder are kept here, and their details are erased after 30 days.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Customer</th><th>Cart</th><th>Last change</th><th>Status</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Customer"><div className="stack" style={{ gap: 2 }}><span>{r.first_name || <span className="muted">Erased</span>}</span><small className="muted">{CHANNEL[r.channel] || r.channel} · {r.contact || '—'}</small></div></td>
                    <td data-label="Cart">{num(r.item_count)} item{r.item_count === 1 ? '' : 's'} · {money(r.subtotal)}</td>
                    <td data-label="Last change"><small>{ago(r.last_activity_at)}</small></td>
                    <td data-label="Status">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Chip tone={STATE[r.state]?.[1]}>{STATE[r.state]?.[0] || r.state}</Chip>
                        {r.reminded_at && <small className="muted">reminded {ago(r.reminded_at)}</small>}
                        {r.opened_at && <small className="muted">· link opened</small>}
                        {r.order && <a className="linkish" href={`#/orders/${r.order.id}`}>Order #{r.order.number}</a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="checkouts" onPage={(n) => setQuery({ page: n })} />}
      </div>
    </>
  );
}

export default function FollowUps({ query }) {
  const view = query.get('view') === 'checkouts' ? 'checkouts' : 'stock';
  return (
    <>
      <PageHeader hud={<><span className="led green" />Sales</>} title="Follow-ups" text="Customers waiting to hear from you: back-in-stock requests and unfinished checkouts." />
      <div className="toolbar">
        <Tabs label="Follow-up type" value={view} onChange={(v) => setQuery({ view: v === 'stock' ? null : v, status: null, state: null, page: null })} items={VIEWS.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      {view === 'stock' ? <StockRequests query={query} /> : <Checkouts query={query} />}
    </>
  );
}
