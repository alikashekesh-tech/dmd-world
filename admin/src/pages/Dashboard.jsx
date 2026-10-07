import { Fragment, useEffect, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useCount } from '../lib/hooks.js';
import { dashboardFromApi } from '../lib/dashboard.js';
import { money, num, pct, ago, until, STATUS, safeHref } from '../lib/format.js';
import { Avatar, Button, Chip, Hp, Icon, Notice, Skeleton, StatusSelect, Tabs, Thumb, useUi } from '../ui/kit.jsx';
import { QUICK } from '../shell/Shell.jsx';

const RANGES = [{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }];
const PREV = { today: 'yesterday', '7d': 'previous 7 days', '30d': 'previous 30 days', '90d': 'previous 90 days' };
const NOW_LABEL = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' };
const pl = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const compact = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);

/* Command Center: what needs the owner, how the store is doing, and a door into every section. */
export default function Dashboard({ query }) {
  const range = query.get('range') || '7d';
  const { data: raw, error, reload, setData } = useApi(`/dashboard?range=${range}`);
  const d = raw?.data ? dashboardFromApi(raw.data) : null;
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { const t = setInterval(() => reload(true), 60e3); return () => clearInterval(t); }, [reload]);
  const refresh = async () => {
    setRefreshing(true);
    try { setData(await api.get(`/dashboard?range=${range}`)); } catch { /* the error state shows below */ }
    setRefreshing(false);
  };

  if (error && !d) return <Notice tone="coral" icon="alert">{error.message}</Notice>;
  if (!d) return <DashboardSkeleton />;
  return (
    <div className="cc">
      <Briefing d={d} range={range} onRefresh={refresh} refreshing={refreshing} />
      <nav className="cc-quick" aria-label="Quick actions">
        {QUICK.filter((q) => q.key).map((q) => <a key={q.to} className="qa" href={`#${q.to}`}><span className="qi"><Icon name={q.icon} size={15} /></span><span className="clamp1">{q.label}</span></a>)}
      </nav>
      <RevenuePanel d={d} range={range} />
      <NeedsYou a={d.attention} />
      <Scoreboard t={d.totals} />
      <OrdersPanel d={d} range={range} />
      <StockPanel low={d.lowStock} out={d.outOfStock} counts={{ low: d.attention.lowStock.count, out: d.attention.outOfStock.count }} />
      <OffersPanel o={d.offers} />
      <TopProducts list={d.topProducts} range={range} />
      <Activity list={d.activity} />
      <RevenueMix categories={d.categories} brands={d.brands} range={range} />
      <RecentBuyers list={d.recentCustomers} />
      <RecentReviews list={d.recentReviews} reload={() => reload(true)} />
    </div>
  );
}

/* ── briefing: one sentence that says what matters, in plain words ──── */
function joinWords(nodes) {
  return nodes.map((n, i) => <Fragment key={i}>{i > 0 && (i === nodes.length - 1 ? ' and ' : ', ')}{n}</Fragment>);
}
function Briefing({ d, range, onRefresh, refreshing }) {
  const a = d.attention;
  const h = new Date().getHours();
  const hello = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const bits = [];
  if (a.pending.count) bits.push(<><b>{pl(a.pending.count, 'order is', 'orders are')}</b> waiting for you</>);
  if (a.messages) bits.push(<><b>{pl(a.messages, 'buyer message is', 'buyer messages are')}</b> unread</>);
  if (a.outOfStock.count) bits.push(<><b>{pl(a.outOfStock.count, 'product is', 'products are')}</b> out of stock</>);
  if (a.reviews) bits.push(<><b>{pl(a.reviews, 'review needs', 'reviews need')}</b> approval</>);
  const ratio = d.target.value ? d.target.today / d.target.value : 0;
  const target = !d.target.value ? null : ratio >= 1 ? <b style={{ color: 'var(--green)' }}>target reached</b> : <>{Math.round(ratio * 100)}% of your target</>;
  return (
    <header className="cc-brief">
      <div style={{ minWidth: 0 }}>
        <span className="hud"><span className="led green pulse" />Command center · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1>{hello}.</h1>
        <p>
          {bits.length ? <>{joinWords(bits)}.</> : <>Nothing needs you right now.</>}{' '}
          Today: <b>{money(d.target.today, true)}</b> from {pl(d.target.todayOrders, 'order', 'orders')}{target && <>, {target}</>}.
        </p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        <Tabs label="Period" items={RANGES} value={range} onChange={(v) => setQuery({ range: v === '7d' ? null : v })} />
        <Button variant="quiet" size="sm" icon="refresh" loading={refreshing} onClick={onRefresh} title={`Updated ${ago(d.generatedAt)}. Refreshes every minute.`}>
          <span className="hide-sm mono" style={{ fontSize: 11 }}>{new Date(d.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </Button>
      </div>
    </header>
  );
}

/* ── revenue stage ───────────────────────────────────────────────────── */
function Delta({ now, prev, label }) {
  const p = pct(now, prev);
  if (p == null) return <span className="delta flat" title={label}>{now ? 'new' : '—'}</span>;
  const dir = p >= 0.5 ? 'up' : p <= -0.5 ? 'down' : 'flat';
  return <span className={`delta ${dir}`} title={label}><Icon name={dir === 'flat' ? 'minus' : dir} size={12} />{Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%</span>;
}

function RevenuePanel({ d, range }) {
  const k = d.kpis;
  const rev = useCount(k.revenue);
  const vs = `vs ${PREV[range]}`;
  return (
    <section className="surface stage span-8" aria-label="Revenue">
      <div className="rev-top">
        <div>
          <span className="hud"><span className="led green" />Revenue · {NOW_LABEL[range]}</span>
          <div className="row" style={{ alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="rev-big">{money(rev, rev >= 10000)}</span>
            <Delta now={k.revenue} prev={k.prevRevenue} label={vs} />
            <span className="muted" style={{ fontSize: 12 }}>{vs} ({money(k.prevRevenue, true)})</span>
          </div>
        </div>
        <a className="btn sm quiet" href={`#/orders`}>All orders<Icon name="arrow" /></a>
      </div>
      <RevenueChart series={d.series} buckets={d.buckets} />
      <div className="kpis">
        {[
          ['Orders', num(k.orders), k.orders, k.prevOrders, '#/orders'],
          ['Avg. order', money(k.aov), k.aov, k.prevAov, '#/orders?status=completed'],
          ['Items sold', num(k.items), k.items, k.prevItems, '#/products?sort=sales'],
          ['New buyers', num(k.newBuyers), k.newBuyers, k.prevNewBuyers, '#/customers'],
        ].map(([label, shown, now, prev, to]) => (
          <a key={label} className="kpi" href={to}>
            <span className="label">{label}</span>
            <span className="row" style={{ gap: 8, alignItems: 'baseline' }}><b>{shown}</b><Delta now={now} prev={prev} label={vs} /></span>
          </a>
        ))}
      </div>
      <TargetBar t={d.target} />
    </section>
  );
}

function niceMax(v) {
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
function bucketLabel(t, buckets, n, long) {
  const dt = new Date(t);
  if (buckets === 'hour') return `${String(dt.getHours()).padStart(2, '0')}:00${long ? `–${String(dt.getHours() + 1).padStart(2, '0')}:00` : ''}`;
  if (long) return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return n <= 7 ? dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* Revenue line (drawn in, like the storefront's line drawings) over order-count bars. */
function RevenueChart({ series, buckets }) {
  const box = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 210, top = 22, bottom = 26;
  const n = series.length || 1;
  const maxR = niceMax(Math.max(1, ...series.map((s) => s.revenue)));
  const maxO = Math.max(1, ...series.map((s) => s.orders));
  const step = w / n;
  const x = (i) => step * i + step / 2;
  const y = (v) => top + (H - top - bottom) * (1 - v / maxR);
  const base = H - bottom;
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.revenue).toFixed(1)}`);
  const line = pts.length > 1 ? `M${pts.join('L')}` : null;
  const area = pts.length > 1 ? `M${x(0)},${base}L${pts.join('L')}L${x(n - 1)},${base}Z` : null;
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(w / 92))));
  const bw = Math.max(2, Math.min(14, step * 0.42));
  const h = hover != null ? series[hover] : null;
  const empty = series.every((s) => !s.revenue && !s.orders);
  return (
    <div className="chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${H}`} height={H} role="img" aria-label="Revenue and orders over time" key={`${n}-${series[0]?.t}`}>
        {[1, 2, 3].map((g) => { const v = (maxR / 3) * g; return (
          <g key={g}><line className="grid" x1="0" x2={w} y1={y(v)} y2={y(v)} /><text className="tick" x="4" y={y(v) - 5}>{compact(v)}</text></g>
        ); })}
        <line className="axis" x1="0" x2={w} y1={base} y2={base} />
        {series.map((s, i) => s.orders > 0 && <rect key={i} className={`obar ${hover === i ? 'on' : ''}`} x={x(i) - bw / 2} y={base - (s.orders / maxO) * 38} width={bw} height={(s.orders / maxO) * 38} rx="2" />)}
        {area && <path className="area" d={area} />}
        {line && <path className="line" d={line} pathLength="1" />}
        {series.length === 1 && <circle className="dot" cx={x(0)} cy={y(series[0].revenue)} r="4" />}
        {series.map((s, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every / 2) && <text key={`l${i}`} className="tick" x={x(i)} y={H - 7} textAnchor="middle">{bucketLabel(s.t, buckets, n)}</text>)}
        {h && <><line className="cross" x1={x(hover)} x2={x(hover)} y1={top - 8} y2={base} /><circle className="dot" cx={x(hover)} cy={y(h.revenue)} r="4.5" /></>}
        {series.map((s, i) => <rect key={`h${i}`} x={step * i} y="0" width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />)}
      </svg>
      {empty && <div className="chart-empty">No orders in this period yet.</div>}
      {h && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 80), w - 80) }}>
          <span className="label">{bucketLabel(h.t, buckets, n, true)}</span>
          <b className="num">{money(h.revenue)}</b>
          <span className="muted">{pl(h.orders, 'order', 'orders')}</span>
        </div>
      )}
    </div>
  );
}

function TargetBar({ t }) {
  if (t.value == null) {
    return (
      <div className="target">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="hud"><span className="led blue" />Today’s target</span>
          <a className="linkish" href="#/settings" style={{ fontSize: 12 }}>Set a target</a>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <b className="num" style={{ fontSize: 19 }}>{money(t.today, true)}</b>
          <span className="muted">today · {pl(t.todayOrders, 'order', 'orders')}</span>
        </div>
        <small className="muted">No daily target set. Add one in Settings to see progress here.</small>
      </div>
    );
  }
  const ratio = t.value ? t.today / t.value : 0;
  const segs = 24;
  const on = Math.min(segs, Math.floor(ratio * segs));
  return (
    <div className="target">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hud"><span className={`led ${ratio >= 1 ? 'green pulse' : 'blue'}`} />Today’s target</span>
        <a className="linkish" href="#/settings" style={{ fontSize: 12 }}>Change target</a>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <b className="num" style={{ fontSize: 19 }}>{money(t.today, true)}</b>
        <span className="muted">of {money(t.value, true)} · {pl(t.todayOrders, 'order', 'orders')}</span>
        <span className="grow" />
        <b className="mono" style={{ color: ratio >= 1 ? 'var(--green)' : 'var(--text-2)' }}>{Math.round(ratio * 100)}%</b>
      </div>
      <div className={`xp ${ratio >= 1 ? 'done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, ratio) * 100)} aria-label="Today’s revenue against target">
        {Array.from({ length: segs }, (_, i) => <i key={i} className={i < on ? 'on' : i === on && ratio > 0 && ratio < 1 ? 'next' : ''} style={{ animationDelay: `${i * 22}ms` }} />)}
      </div>
      <small className="muted">
        {ratio >= 1 ? 'Target reached. Everything from here is extra.' : `${money(t.value - t.today, true)} to go.`}
      </small>
    </div>
  );
}

/* ── needs you: the work queue, most urgent first ────────────────────── */
function NeedsYou({ a }) {
  const items = [
    { key: 'pending', n: a.pending.count, tone: 'amber', icon: 'receipt', label: 'Orders waiting', text: a.pending.oldest ? `Oldest placed ${ago(a.pending.oldest)}` : 'Confirm or cancel them', to: '/orders?status=pending', urgent: a.pending.oldest && Date.now() - new Date(a.pending.oldest).getTime() > 864e5 },
    { key: 'out', n: a.outOfStock.count, tone: 'coral', icon: 'layers', label: 'Out of stock', text: a.outOfStock.sample.join(' · ') || 'Restock or hide them', to: '/inventory?level=out', urgent: a.outOfStock.count > 0 },
    { key: 'messages', n: a.messages, tone: 'blue', icon: 'chat', label: 'Unread messages', text: 'Buyers waiting on a reply', to: '/messages?filter=unread' },
    { key: 'low', n: a.lowStock.count, tone: 'amber', icon: 'layers', label: 'Running low', text: a.lowStock.sample.join(' · '), to: '/inventory?level=low' },
    { key: 'reviews', n: a.reviews, tone: 'violet', icon: 'star', label: 'Reviews to approve', text: 'Hidden until you approve them', to: '/reviews?status=pending' },
    { key: 'hold', n: a.onHold, tone: 'violet', icon: 'clock', label: 'Orders on hold', text: 'Waiting on payment or stock', to: '/orders?status=on_hold' },
    { key: 'ending', n: a.ending, tone: 'blue', icon: 'percent', label: 'Offers ending soon', text: 'Within the next 3 days', to: '/offers' },
    { key: 'waiting', n: a.stockAlerts, tone: 'blue', icon: 'bell', label: 'Buyers waiting on stock', text: 'Restocking emails them', to: '/inventory?level=out' },
  ];
  const open = items.filter((i) => i.n > 0);
  const clear = items.filter((i) => !i.n);
  const total = open.reduce((s, i) => s + i.n, 0);
  return (
    <section className="surface span-4 queue" aria-label="Needs your attention">
      <div className="queue-head">
        <div>
          <span className="hud"><span className={`led ${open.length ? 'amber pulse' : 'green'}`} />Needs you</span>
          <p className="t2" style={{ marginTop: 6, fontSize: 13 }}>{open.length ? `${pl(open.length, 'kind of task', 'kinds of task')} open` : 'All clear. Nice work.'}</p>
        </div>
        <span className="queue-n num" style={{ color: open.length ? 'var(--text)' : 'var(--green)' }}>{num(total)}</span>
      </div>
      <ul>
        {open.map((i) => (
          <li key={i.key}>
            <a className={`q-item ${i.tone} ${i.urgent ? 'urgent' : ''}`} href={`#${i.to}`}>
              <span className="q-ic"><Icon name={i.icon} size={16} /></span>
              <span className="ql"><b>{i.label}</b>{i.text && <small>{i.text}</small>}</span>
              <span className="qn">{num(i.n)}</span>
              <Icon name="chevron" size={14} className="muted" />
            </a>
          </li>
        ))}
      </ul>
      {clear.length > 0 && (
        <div className="q-clear">
          {clear.map((i) => <a key={i.key} href={`#${i.to}`} className="chip green" title={`${i.label}: none`}><Icon name="check" size={12} />{i.label.replace(/^(Orders|Reviews|Offers) /, '').replace(/^\w/, (c) => c.toUpperCase())}</a>)}
        </div>
      )}
    </section>
  );
}

/* ── all-time scoreboard ─────────────────────────────────────────────── */
function Scoreboard({ t }) {
  const cells = [
    ['Total revenue', t.revenue == null ? '—' : money(t.revenue, true), 'All time, paid orders', '#/orders'],
    ['Orders', num(t.orders), 'All time', '#/orders'],
    ['Products', num(t.products), `${num(t.published)} published`, '#/products'],
    ['Customers', num(t.customers), 'Registered accounts', '#/customers'],
    ['Active offers', num(t.offers), 'Running offers and live codes', '#/offers'],
  ];
  return (
    <section className="surface score span-12" aria-label="Store totals">
      {cells.map(([label, value, hint, to]) => (
        <a key={label} href={to}><span className="label">{label}</span><b className="num">{value}</b><small>{hint}</small></a>
      ))}
    </section>
  );
}

/* ── orders: the pipeline and the latest sales ───────────────────────── */
function OrdersPanel({ d, range }) {
  const { toast, fail, confirm } = useUi();
  const [busy, setBusy] = useState(null);
  const s = d.status;
  const setStatus = async (o, status) => {
    if (status === o.status) return;
    if (status === 'cancelled' && !(await confirm({ title: `Cancel order #${o.number}?`, text: 'Its items go back into stock. You can change the status again later.', confirmLabel: 'Cancel order', danger: true }))) return;
    setBusy(o.id);
    try {
      await api.put(`/orders/${o.id}/status`, { status });
      changed('orders');
      toast(`Order #${o.number} is now ${STATUS[status]?.label.toLowerCase() || status}`, { undo: async () => { await api.put(`/orders/${o.id}/status`, { status: o.status }).catch(fail); changed('orders'); } });
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const mixTotal = Object.values(s.mix || {}).reduce((a, b) => a + b, 0);
  const node = (key, label, n, tone) => (
    <a className={`pipe-node ${tone}`} href={`#/orders?status=${key}`}>
      <span className="label"><span className={`led ${tone}`} />{label}</span>
      <b className="num">{num(n)}</b>
    </a>
  );
  return (
    <section className="surface span-8" aria-label="Orders">
      <div className="surface-head">
        <h2>Orders</h2>
        <a className="btn sm quiet" href="#/orders">Manage orders<Icon name="arrow" /></a>
      </div>
      <div className="pipe">
        {node('pending', 'Pending', s.pending, 'amber')}
        <Icon name="chevron" className="pipe-arrow" />
        {node('processing', 'Processing', s.processing, 'blue')}
        <Icon name="chevron" className="pipe-arrow" />
        {node('completed', 'Completed', s.completed, 'green')}
        <div className="pipe-side">
          <a href="#/orders?status=on_hold"><span className="led violet" />On hold <b>{num(s.onHold)}</b></a>
          <a href="#/orders?status=cancelled"><span className="led coral" />Cancelled <b>{num(s.cancelled)}</b></a>
          {s.refunded > 0 && <a href="#/orders?status=refunded"><span className="led" />Refunded <b>{num(s.refunded)}</b></a>}
          {s.failed > 0 && <a href="#/orders?status=failed"><span className="led coral" />Failed <b>{num(s.failed)}</b></a>}
        </div>
      </div>
      {mixTotal > 0 && (
        <div className="mix-wrap">
          <span className="label">{NOW_LABEL[range]} · {pl(mixTotal, 'order', 'orders')}</span>
          <div className="mix">
            {Object.entries(s.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => <i key={k} className={STATUS[k]?.tone || 'muted'} style={{ flexGrow: v }} title={`${STATUS[k]?.label || k}: ${v}`} />)}
          </div>
          <div className="row wrap" style={{ gap: 12 }}>
            {Object.entries(s.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="mix-key"><span className={`led ${STATUS[k]?.tone || ''}`} />{STATUS[k]?.label || k} <b>{Math.round((v / mixTotal) * 100)}%</b></span>)}
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table cards compact">
          <thead><tr><th>Order</th><th>Items</th><th className="right">Total</th><th>Status</th><th>Placed</th></tr></thead>
          <tbody>
            {d.recentOrders.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                <td><div className="cell-main"><Avatar name={o.customer} size="" /><div style={{ minWidth: 0 }}><b>#{o.number} · {o.customer}</b><small>{o.email}{o.user_id ? '' : ' · guest'}</small></div></div></td>
                <td data-label="Items" className="hide-compact"><span className="muted mono" style={{ fontSize: 11.5 }}>{o.units}×</span></td>
                <td className="right" data-label="Total"><b className="num">{money(o.total)}</b></td>
                <td data-label="Status"><StatusSelect status={o.status} busy={busy === o.id} onChange={(v) => setStatus(o, v)} /></td>
                <td data-label="Placed" className="muted mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{ago(o.placed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.recentOrders.length && <div className="empty"><p>No orders yet.</p></div>}
      </div>
    </section>
  );
}

/* ── stock: fix it right here ────────────────────────────────────────── */
function StockRow({ p, level }) {
  const { toast, fail } = useUi();
  const start = String(p.manage_stock ? p.stock_quantity ?? 0 : 0);
  const [v, setV] = useState(start);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(start), [start]);
  const dirty = v !== start && v !== '';
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try { const { data: r } = await api.put(`/inventory/${p.id}`, { stock_quantity: Number(v) }); toast(`${p.name}: ${r.stock_quantity} in stock`); changed('stock'); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <li className="stock-row">
      <Thumb src={p.image} size="sm" />
      <a className="grow" href={`#/inventory?focus=${p.id}`} style={{ minWidth: 0 }}>
        <b className="clamp1">{p.name}</b>
        <Hp qty={p.manage_stock ? p.stock_quantity : 0} level={level} scale={10} />
      </a>
      <form className="restock" onSubmit={save}>
        <input className="input mono" type="number" min="0" step="1" value={v} onChange={(e) => setV(e.target.value)} aria-label={`New stock for ${p.name}`} />
        <Button size="sm" variant={dirty ? 'primary' : 'quiet'} icon="check" type="submit" loading={busy} disabled={!dirty} aria-label="Save stock" />
      </form>
    </li>
  );
}
function StockPanel({ low, out, counts }) {
  const [tab, setTab] = useState(out.length ? 'out' : 'low');
  const list = tab === 'out' ? out : low;
  return (
    <section className="surface span-4" aria-label="Stock alerts">
      <div className="surface-head">
        <h2>Stock alerts</h2>
        <Tabs label="Stock" value={tab} onChange={setTab} items={[{ value: 'out', label: 'Out', count: counts.out, led: counts.out ? 'coral' : undefined }, { value: 'low', label: 'Low', count: counts.low, led: counts.low ? 'amber' : undefined }]} />
      </div>
      {list.length ? (
        <ul className="ledger">{list.map((p) => <StockRow key={p.id} p={p} level={tab} />)}</ul>
      ) : (
        <div className="empty" style={{ padding: 28 }}><Icon name="check" /><p>{tab === 'out' ? 'Nothing is out of stock.' : 'Nothing is running low.'}</p></div>
      )}
      <a className="panel-foot" href={`#/inventory?level=${tab}`}>Open inventory<Icon name="arrow" size={14} /></a>
    </section>
  );
}

/* ── offers ──────────────────────────────────────────────────────────── */
function OffersPanel({ o }) {
  return (
    <section className="surface span-4" aria-label="Active offers">
      <div className="surface-head"><h2>Active offers</h2><a className="btn sm" href="#/offers?new=offer"><Icon name="plus" />Create offer</a></div>
      <div className="trio">
        <a href="#/offers?tab=sales"><b className="num">{num(o.onSale)}</b><span className="label">On sale</span></a>
        <a href="#/offers?tab=coupons"><b className="num">{num(o.coupons)}</b><span className="label">Coupons</span></a>
        <a href="#/offers"><b className="num">{num(o.campaigns)}</b><span className="label">Offers</span></a>
      </div>
      <ul className="ledger">
        {o.list.map((p) => {
          const off = Number(p.regular_price) > 0 ? Math.round((1 - Number(p.price) / Number(p.regular_price)) * 100) : 0;
          return (
            <li key={p.id}>
              <a className="mini-row" href={`#/products/${p.id}`}>
                <Thumb src={p.image} size="sm" />
                <span className="grow clamp1">{p.name}</span>
                <span className="mono" style={{ fontSize: 12 }}><b style={{ color: 'var(--text)' }}>{money(p.price)}</b> <del className="muted">{money(p.regular_price)}</del></span>
                {off > 0 && <Chip tone="coral">−{off}%</Chip>}
              </a>
            </li>
          );
        })}
        {o.coupon.map((c) => (
          <li key={`c${c.id}`}>
            <a className="mini-row" href="#/offers?tab=coupons">
              <span className="coupon-code">{c.code}</span>
              <span className="grow muted" style={{ fontSize: 12 }}>{c.label}{c.date_expires ? ` · ends ${until(c.date_expires)}` : ''}</span>
              <span className="mono muted" style={{ fontSize: 11.5 }}>used {num(c.usage_count)}×</span>
            </a>
          </li>
        ))}
      </ul>
      {!o.list.length && !o.coupon.length && <div className="empty" style={{ padding: 24 }}><p>No offers running. A small, time-limited discount is the quickest way to move slow stock.</p></div>}
    </section>
  );
}

/* ── leaderboards ────────────────────────────────────────────────────── */
function TopProducts({ list, range }) {
  const max = Math.max(1, ...list.map((p) => p.revenue));
  return (
    <section className="surface span-4" aria-label="Top products">
      <div className="surface-head"><h2>Top products</h2><span className="hud">{NOW_LABEL[range]}</span></div>
      <ol className="ledger">
        {list.map((p, i) => (
          <li key={p.id ?? `gone-${i}`}>
            <a className="lb" href={p.id ? `#/products/${p.id}` : undefined}>
              <span className="rk">{String(i + 1).padStart(2, '0')}</span>
              <Thumb src={p.image} size="sm" />
              <span style={{ minWidth: 0 }}>
                <b className="clamp1">{p.name}</b>
                <span className="bar"><i style={{ width: `${(p.revenue / max) * 100}%`, animationDelay: `${i * 70}ms` }} /></span>
              </span>
              <span className="lb-v"><b className="num">{money(p.revenue, true)}</b><small>{num(p.units)} sold{p.stock != null ? ` · ${p.stock} left` : ''}</small></span>
            </a>
          </li>
        ))}
      </ol>
      {!list.length && <div className="empty" style={{ padding: 28 }}><p>No paid orders in this period yet.</p></div>}
    </section>
  );
}

const ACT_ICON = { order: 'receipt', review: 'star', product: 'box', stock: 'layers', offer: 'percent', trash: 'trash', category: 'folder', message: 'chat', customer: 'users', settings: 'settings', homepage: 'home' };
function Activity({ list }) {
  return (
    <section className="surface span-4" aria-label="Recent activity">
      <div className="surface-head"><h2>Recent activity</h2><span className="hud"><span className="led green pulse" />Live</span></div>
      <ul className="tl">
        {list.slice(0, 9).map((a) => {
          const inner = (
            <>
              <span className={`ti ${a.source === 'admin' ? 'you' : ''}`}><Icon name={ACT_ICON[a.type] || 'bolt'} size={14} /></span>
              <span style={{ minWidth: 0 }}><span className="tl-text">{a.text}</span><small>{a.source === 'admin' ? 'You · ' : ''}{ago(a.at)}</small></span>
            </>
          );
          return <li key={a.id}>{safeHref(a.ref) ? <a href={safeHref(a.ref)}>{inner}</a> : <div>{inner}</div>}</li>;
        })}
      </ul>
      {!list.length && <div className="empty" style={{ padding: 28 }}><p>Quiet so far.</p></div>}
    </section>
  );
}

function Bars({ rows, tone, linkFor }) {
  const total = rows.reduce((a, r) => a + r.revenue, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <ul className="bars">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="clamp1">{r.name}</span><span className="mono" style={{ fontSize: 12 }}><b>{money(r.revenue, true)}</b> <span className="muted">{Math.round((r.revenue / total) * 100)}%</span></span></span>
            <span className={`bar ${tone}`}><i style={{ width: `${(r.revenue / max) * 100}%`, animationDelay: `${i * 60}ms` }} /></span>
          </>
        );
        const to = linkFor(r);
        return <li key={r.id ?? r.name}>{to ? <a href={to}>{body}</a> : <div>{body}</div>}</li>;
      })}
      {!rows.length && <li className="muted" style={{ fontSize: 13 }}>No sales in this period.</li>}
    </ul>
  );
}
function RevenueMix({ categories, brands, range }) {
  return (
    <section className="surface span-8" aria-label="Revenue by category and brand">
      <div className="surface-head"><h2>Where the money comes from</h2><span className="hud">{NOW_LABEL[range]}</span></div>
      <div className="mix-cols">
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><span className="label">By category</span><a className="linkish" style={{ fontSize: 12 }} href="#/categories">Categories</a></div>
          <Bars rows={categories} tone="" linkFor={(r) => (r.id ? `#/products?category=${r.id}` : null)} />
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><span className="label">By brand</span><a className="linkish" style={{ fontSize: 12 }} href="#/brands">Brands</a></div>
          <Bars rows={brands} tone="violet" linkFor={(r) => `#/products?brand=${r.id}`} />
        </div>
      </div>
    </section>
  );
}

function RecentBuyers({ list }) {
  return (
    <section className="surface span-4 solo-md" aria-label="Recent customers">
      <div className="surface-head"><h2>New customers</h2><a className="btn sm quiet" href="#/customers">All buyers<Icon name="arrow" /></a></div>
      <ul className="ledger">
        {list.map((c) => (
          <li key={c.id}>
            <a className="mini-row" href={`#/customers/${c.id}`}>
              <Avatar name={c.name} />
              <span className="grow" style={{ minWidth: 0 }}><b className="clamp1" style={{ fontWeight: 600 }}>{c.name}</b><small className="muted" style={{ fontSize: 12 }}>{[c.city, `joined ${ago(c.date_created)}`].filter(Boolean).join(' · ')}</small></span>
              <span style={{ textAlign: 'right' }}><b className="num" style={{ fontSize: 13.5 }}>{money(c.spent, true)}</b><small className="muted mono" style={{ display: 'block', fontSize: 11 }}>{pl(c.orders, 'order', 'orders')}</small></span>
            </a>
          </li>
        ))}
      </ul>
      {!list.length && <div className="empty" style={{ padding: 28 }}><p>No registered customers yet.</p></div>}
    </section>
  );
}

export function Stars({ n }) {
  return <span className="stars" aria-label={`${n} out of 5 stars`}>{'★★★★★'.slice(0, n)}<span>{'★★★★★'.slice(n)}</span></span>;
}
function RecentReviews({ list, reload }) {
  const { toast, fail } = useUi();
  const [busy, setBusy] = useState(null);
  const act = async (r, status) => {
    setBusy(r.id);
    try { await api.put(`/reviews/${r.id}`, { status }); changed('reviews'); toast(status === 'approved' ? `Approved ${r.reviewer}’s review` : `Unpublished ${r.reviewer}’s review`); reload?.(); } catch (e) { fail(e); }
    setBusy(null);
  };
  return (
    <section className="surface span-12" aria-label="Recent reviews">
      <div className="surface-head"><h2>Recent reviews</h2><a className="btn sm quiet" href="#/reviews">All reviews<Icon name="arrow" /></a></div>
      <div className="rv-grid">
        {list.slice(0, 6).map((r) => (
          <article key={r.id} className={`rv ${r.status === 'pending' ? 'held' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}><Stars n={r.rating} />{r.status === 'pending' ? <Chip tone="amber" led>Pending</Chip> : r.status === 'approved' ? <Chip tone="green">Published</Chip> : <Chip tone="muted">{r.status}</Chip>}</div>
            <p className="rv-text">“{r.review || 'No text'}”</p>
            <small className="muted">{r.reviewer} on <a className="linkish" href={`#/products/${r.product_id}`}>{r.product_name}</a> · {ago(r.date_created)}</small>
            <div className="row" style={{ gap: 6 }}>
              {r.status !== 'approved' && <Button size="sm" icon="check" loading={busy === r.id} onClick={() => act(r, 'approved')}>Approve</Button>}
              {r.status === 'approved' && <Button size="sm" variant="quiet" icon="eyeOff" loading={busy === r.id} onClick={() => act(r, 'pending')}>Unpublish</Button>}
            </div>
          </article>
        ))}
      </div>
      {!list.length && <div className="empty" style={{ padding: 28 }}><p>No reviews yet.</p></div>}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="cc" aria-busy="true">
      <div className="span-12 stack" style={{ gap: 10 }}><Skeleton h={12} w={240} /><Skeleton h={34} w={320} /><Skeleton h={16} w="60%" /></div>
      <div className="surface span-8" style={{ height: 470, padding: 20 }}><Skeleton h={50} w={260} /><div style={{ height: 20 }} /><Skeleton h={300} /></div>
      <div className="surface span-4" style={{ height: 470, padding: 20 }}><div className="stack">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={46} />)}</div></div>
      <div className="surface span-12" style={{ height: 86 }} />
    </div>
  );
}
