import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PixelText from '../components/ui/PixelText.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { ProductImage } from '../components/art/Media.jsx';
import { Rating } from '../components/common/bits.jsx';
import { ArrowRight, RepeatIcon, BellIcon, TrashIcon } from '../components/common/icons.jsx';
import { PasswordField, PasswordRules, MatchHint, passwordReady } from '../components/account/Password.jsx';
import { storeApi, ORDER_STATUS } from '../lib/storeApi.js';
import { getProduct, money } from '../data/index.js';
import { useCatalog } from '../data/live.js';
import { usePageMeta } from '../lib/meta.js';
import { CONTACT } from '../data/dmdMenu.js';
import { LARAVEL } from '../lib/backend.js';
import { account } from '../lib/account.js';
import { reviews as reviewApi, messages as messageApi } from '../lib/community.js';
import AddressBook from '../components/account/AddressBook.jsx';
import s from './Account.module.css';

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const longDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function StatusTag({ status }) {
  const st = ORDER_STATUS[status] || { label: status, tone: 'wait' };
  return <span className={`${s.status} ${s[st.tone] || ''}`} title={st.hint}>{st.label}</span>;
}

function ItemThumb({ item }) {
  const p = getProduct(String(item.productId));
  if (p) return <Link to={`/product/${p.slug}`} className={s.oThumb} title={item.name}><ProductImage product={p} /></Link>;
  return <span className={s.oThumb} title={item.name}>{item.image ? <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}</span>;
}

/* ── signed out: sign in, create an account, or reset a forgotten password ── */
function SignIn() {
  const { signIn, register, accounts, sessionError, retrySession } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  // Only plain paths on this site: no "//host", no backslashes (browsers read "/\host" as another site), no spaces.
  const back = () => { if (next && /^\/(?![/\\])[^\\\s]*$/.test(next) && next.length < 300) nav(next); };
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (e) => { setF((x) => ({ ...x, [e.target.name]: e.target.value })); setErr(''); };
  const setPw = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErr(''); };
  const go = (m) => { setMode(m); setErr(''); setDone(''); setF((x) => ({ ...x, password: '', confirm: '' })); };

  const ready = mode === 'in' ? isEmail(f.email) && f.password.length > 0
    : mode === 'up' ? f.firstName.trim() && f.lastName.trim() && isEmail(f.email) && passwordReady(f.password) && f.password === f.confirm
      : isEmail(f.email);

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'in') { await signIn(f.email.trim(), f.password); back(); return; }
      if (mode === 'up') { await register({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, confirm: f.confirm }); back(); return; }
      else setDone(LARAVEL ? await account.forgot(f.email.trim()) : (await storeApi.post('/password/forgot', { email: f.email.trim() })).message);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const title = { in: 'Welcome back', up: 'Create your account', forgot: 'Reset your password' }[mode];
  const lead = { in: 'Sign in to see your orders, messages and saved gear.', up: 'Track orders, save gear and review what you bought.', forgot: 'Enter your account email and we’ll send you a link to choose a new password.' }[mode];
  return (
    <div className={`container ${s.auth}`}>
      <div className={s.authPanel}>
        <div className={s.authStage}>
          <p className={s.hud}>{mode === 'in' ? 'Player login' : mode === 'up' ? 'New player' : 'Continue?'}</p>
          <PixelText text={mode === 'forgot' ? 'CONTINUE' : 'PRESS START'} className={s.press} cellClass={s.pressOn} />
          <div className={s.authArt} aria-hidden="true"><LineArt type="controller" /></div>
          <p className={s.authNote}>One account for the whole DMD World store: your orders, saved gear, reviews and messages, kept private to you.</p>
        </div>
        <div className={s.authCard}>
          <h1>{title}</h1>
          <p>{lead}</p>
          {sessionError && <p className={s.notice} role="alert">We can’t reach the store right now, so signing in may not work. <button type="button" className={s.retry} onClick={retrySession}>Try again</button></p>}
          {!sessionError && !accounts && <p className={s.notice} role="status">Accounts are being switched on. You can still check out as a guest.</p>}
          {done ? (
            <div className={s.sent} role="status">
              <b>Check your email</b>
              <p>{done}</p>
              <button type="button" className="btn btn--secondary btn--block" onClick={() => go('in')}>Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              {mode === 'up' && (
                <div className={s.two}>
                  <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" className="input" value={f.firstName} onChange={set} autoComplete="given-name" /></div>
                  <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" className="input" value={f.lastName} onChange={set} autoComplete="family-name" /></div>
                </div>
              )}
              <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" value={f.email} onChange={set} autoComplete="email" aria-invalid={f.email && !isEmail(f.email) ? true : undefined} /></div>
              {mode === 'up' && <div className="field"><label htmlFor="phone">Phone <span className={s.opt}>optional</span></label><input id="phone" name="phone" type="tel" className="input" value={f.phone} onChange={set} autoComplete="tel" placeholder="+961 …" /></div>}
              {mode === 'in' && (
                <PasswordField label="Password" value={f.password} onChange={setPw('password')} autoComplete="current-password">
                  <button type="button" className={s.forgot} onClick={() => go('forgot')}>Forgot your password?</button>
                </PasswordField>
              )}
              {mode === 'up' && (
                <>
                  <PasswordField label="Password" value={f.password} onChange={setPw('password')} autoComplete="new-password" describedBy="pw-rules" invalid={f.password && !passwordReady(f.password)} />
                  <PasswordRules id="pw-rules" password={f.password} />
                  <PasswordField label="Confirm password" value={f.confirm} onChange={setPw('confirm')} autoComplete="new-password" describedBy="pw-match" invalid={f.confirm && f.confirm !== f.password}>
                    <MatchHint id="pw-match" password={f.password} confirm={f.confirm} />
                  </PasswordField>
                </>
              )}
              {err && <p className={s.err} role="alert">{err}</p>}
              <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!ready || busy || !accounts}>
                {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Email me a reset link'} <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className={s.switch}>
            {mode === 'in' ? <>New to DMD World? <button type="button" onClick={() => go('up')}>Create an account</button></>
              : <>Already have an account? <button type="button" onClick={() => go('in')}>Sign in</button></>}
          </p>
          <small>Your password is checked by the store and never kept in this browser.</small>
        </div>
      </div>
    </div>
  );
}

/* ── signed in ───────────────────────────────────────────────────────── */
function Orders() {
  const { orders, ordersMore, loadMoreOrders, addToCart, setToast } = useStore();
  useCatalog();
  const [more, setMore] = useState(false);
  const again = (o) => {
    const ok = o.items.filter((it) => { const p = getProduct(String(it.productId)); return p && p.stock !== 'out'; });
    ok.forEach((it, i) => addToCart(String(it.productId), it.qty, undefined, { open: i === ok.length - 1 }));
    const missing = o.items.length - ok.length;
    setToast(ok.length ? `Added ${ok.length} item${ok.length === 1 ? '' : 's'} to your cart${missing ? ` · ${missing} no longer available` : ''}` : 'Those items aren’t available right now');
  };
  const loadMore = async () => { setMore(true); try { await loadMoreOrders(); } catch (e) { setToast(e.message); } setMore(false); };
  if (!orders.length) return (
    <EmptyState compact art={<LineArt type="receipt" />} status="No orders yet" title="Nothing ordered yet" text="When you place an order it shows up here.">
      <Link to="/shop" className="btn btn--primary">Start shopping <ArrowRight size={16} /></Link>
    </EmptyState>
  );
  return (
    <ul className={s.orders}>{orders.map((o, i) => {
      const units = o.items.reduce((a, it) => a + it.qty, 0);
      const reviewable = ['processing', 'completed'].includes(o.status);
      return (
        <li key={o.id} style={{ '--i': i }}>
          <div className={s.oHead}>
            <div><b>Order #{o.number}</b><small>{longDate(o.date)}</small></div>
            <StatusTag status={o.status} />
            <b className={s.oTotal}>{money(Number(o.total))}</b>
          </div>
          <div className={s.oItems}>
            {o.items.map((it) => <ItemThumb key={`${it.productId}-${it.name}`} item={it} />)}
            <span>{units} item{units === 1 ? '' : 's'}</span>
            <span className={s.oActions}>
              <button type="button" className="link" onClick={() => again(o)}><RepeatIcon size={14} />Buy again</button>
              <Link to={`/order/${o.id}`} className="link">Details <ArrowRight size={14} /></Link>
            </span>
          </div>
          {reviewable && (
            <div className={s.reviewRow}>
              {o.items.filter((it) => getProduct(String(it.productId))).map((it) => (
                <Link key={it.productId} to={`/product/${it.productId}?review=1#reviews`} className={s.reviewLink}>Review {it.name.length > 34 ? `${it.name.slice(0, 32)}…` : it.name}</Link>
              ))}
            </div>
          )}
        </li>
      );
    })}
      {ordersMore && <li className={s.moreRow}><button type="button" className="btn btn--secondary" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Show older orders'}</button></li>}
    </ul>
  );
}

/** Laravel: one conversation per order (started by the first message), plus any general ones. */
function LaravelMessages() {
  const { refreshInbox, orders } = useStore();
  const [params] = useSearchParams();
  const [convs, setConvs] = useState(null);
  const [open, setOpen] = useState(() => (params.get('conversation') ? `c${params.get('conversation')}` : params.get('order') ? `o${params.get('order')}` : null));
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { messageApi.list().then((r) => setConvs(r.items)).catch((e) => setErr(e.message)); }, []);
  // The buyer's orders (each can be asked about) and conversations, as one list.
  const list = useMemo(() => {
    if (!convs) return null;
    const byOrder = new Map(convs.filter((c) => c.orderId).map((c) => [c.orderId, c]));
    const fromOrders = orders.map((o) => ({ key: `o${o.id}`, orderId: o.id, number: o.number, status: o.status, note: o.note, conv: byOrder.get(o.id) || null }));
    const known = new Set(orders.map((o) => o.id));
    const others = convs.filter((c) => !c.orderId || !known.has(c.orderId)).map((c) => ({ key: c.orderId ? `o${c.orderId}` : `c${c.id}`, orderId: c.orderId, number: c.number, status: c.status, subject: c.subject, conv: c }));
    return [...others.filter((t) => t.orderId), ...fromOrders, ...others.filter((t) => !t.orderId)];
  }, [convs, orders]);
  const current = list?.find((t) => t.key === open) || null;
  const convId = current?.conv?.id ?? (open?.startsWith('c') ? Number(open.slice(1)) : null);
  const ready = list !== null;
  useEffect(() => {
    if (!open || !ready) return;
    setErr('');
    if (!convId) { setThread({ thread: [] }); return; }
    setThread(null);
    messageApi.get(convId).then((c) => { setThread(c); setConvs((l) => l.map((x) => (x.id === c.id ? { ...x, unread: false } : x))); refreshInbox(); }).catch((e) => setErr(e.message));
  }, [open, convId, ready, refreshInbox]);
  const send = async (e) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true); setErr('');
    try {
      if (convId) {
        const m = await messageApi.reply(convId, text);
        setThread((t) => ({ ...t, thread: [...t.thread, m] }));
        setConvs((l) => l.map((x) => (x.id === convId ? { ...x, last: m.at } : x)));
      } else {
        const c = await messageApi.start(current.orderId, text);
        setThread(c); setConvs((l) => [c, ...l]);
      }
      setText('');
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  if (!list) return <p className={s.muted}>{err || 'Loading your messages…'}</p>;
  if (!list.length) return <EmptyState compact art={<LineArt type="receipt" />} status="No messages" title="No orders to talk about yet" text="Once you order, you can message DMD about it here." />;
  const title = (t) => (t.orderId ? `Order #${t.number}` : t.subject);
  return (
    <div className={s.msgs}>
      <ul className={s.threadList}>
        {list.map((t) => (
          <li key={t.key}>
            <button type="button" className={`${s.threadBtn} ${open === t.key ? s.on : ''}`} onClick={() => setOpen(t.key)} aria-current={open === t.key ? 'true' : undefined}>
              <span><b>{title(t)}</b><small>{t.conv ? (t.conv.last ? `Last message ${shortDate(t.conv.last)}` : 'Conversation') : 'Ask about this order'}</small></span>
              {t.conv?.unread && <i className={s.dot} aria-label="New reply" />}
            </button>
          </li>
        ))}
      </ul>
      <div className={s.thread}>
        {!current ? <p className={s.muted}>Pick an order to see messages with DMD World, or to ask something about it.</p>
          : !thread ? <p className={s.muted}>{err || 'Loading…'}</p> : (
            <>
              <div className={s.threadHead}><b>{title(current)}</b>{current.status && <StatusTag status={current.status === 'on_hold' ? 'on-hold' : current.status} />}</div>
              <div className={s.bubbles}>
                {current.note && <div className={`${s.bubble} ${s.you}`}><p>{current.note}</p><small>You · note at checkout</small></div>}
                {thread.thread.length === 0 && !current.note && <p className={s.muted}>No messages yet. Ask DMD anything about this order.</p>}
                {thread.thread.map((m) => (
                  <div key={m.id} className={`${s.bubble} ${m.from === 'you' ? s.you : s.store}`}>
                    <p>{m.text}</p>
                    <small>{m.from === 'you' ? 'You' : 'DMD World'} · {new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
                  </div>
                ))}
              </div>
              {(current.orderId || convId) && (
                <form className={s.composer} onSubmit={send}>
                  <label className="sr-only" htmlFor="msg">Message to DMD World</label>
                  <textarea id="msg" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to DMD World…" maxLength={2000} />
                  {err && <p className={s.err} role="alert">{err}</p>}
                  <div><small className={s.muted}>DMD replies here and by email.</small><button type="submit" className="btn btn--primary btn--sm" disabled={busy || text.trim().length < 2}>{busy ? 'Sending…' : 'Send'}</button></div>
                </form>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function Messages() {
  const { refreshInbox } = useStore();
  const [params] = useSearchParams();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(() => Number(params.get('order')) || null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { storeApi.get('/me/messages').then((r) => setList(r.items)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!open) return;
    setThread(null); setErr('');
    storeApi.get(`/me/messages/${open}`).then((r) => { setThread(r); setList((l) => l?.map((x) => (x.orderId === open ? { ...x, unread: false } : x))); refreshInbox(); }).catch((e) => setErr(e.message));
  }, [open, refreshInbox]);
  const send = async (e) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true); setErr('');
    try {
      const m = await storeApi.post(`/me/messages/${open}`, { text });
      setThread((t) => ({ ...t, thread: [...t.thread, m] })); setText('');
      setList((l) => l?.map((x) => (x.orderId === open ? { ...x, hasThread: true } : x)));
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  if (!list) return <p className={s.muted}>{err || 'Loading your messages…'}</p>;
  if (!list.length) return <EmptyState compact art={<LineArt type="receipt" />} status="No messages" title="No orders to talk about yet" text="Once you order, you can message DMD about it here." />;
  return (
    <div className={s.msgs}>
      <ul className={s.threadList}>
        {list.map((t) => (
          <li key={t.orderId}>
            <button type="button" className={`${s.threadBtn} ${open === t.orderId ? s.on : ''}`} onClick={() => setOpen(t.orderId)} aria-current={open === t.orderId ? 'true' : undefined}>
              <span><b>Order #{t.number}</b><small>{t.hasThread ? (t.last ? `Last message ${shortDate(t.last)}` : 'Conversation') : 'Ask about this order'}</small></span>
              {t.unread && <i className={s.dot} aria-label="New reply" />}
            </button>
          </li>
        ))}
      </ul>
      <div className={s.thread}>
        {!open ? <p className={s.muted}>Pick an order to see messages with DMD World, or to ask something about it.</p>
          : !thread ? <p className={s.muted}>{err || 'Loading…'}</p> : (
            <>
              <div className={s.threadHead}><b>Order #{thread.order.number}</b><StatusTag status={thread.order.status} /></div>
              <div className={s.bubbles}>
                {thread.thread.length === 0 && <p className={s.muted}>No messages yet. Ask DMD anything about this order.</p>}
                {thread.thread.map((m) => (
                  <div key={m.id} className={`${s.bubble} ${m.from === 'you' ? s.you : s.store}`}>
                    <p>{m.text}</p>
                    <small>{m.from === 'you' ? 'You' : 'DMD World'} · {new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
                  </div>
                ))}
              </div>
              <form className={s.composer} onSubmit={send}>
                <label className="sr-only" htmlFor="msg">Message to DMD World</label>
                <textarea id="msg" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to DMD World…" maxLength={2000} />
                {err && <p className={s.err} role="alert">{err}</p>}
                <div><small className={s.muted}>DMD replies here and by email.</small><button type="submit" className="btn btn--primary btn--sm" disabled={busy || text.trim().length < 2}>{busy ? 'Sending…' : 'Send'}</button></div>
              </form>
            </>
          )}
      </div>
    </div>
  );
}

const REVIEW_STATUS = { pending: ['Pending approval', s.wait], published: ['Published', s.done], hidden: ['Not published', s.stop] };
function MyReviews() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { (LARAVEL ? reviewApi.mine() : storeApi.get('/me/reviews').then((r) => r.items)).then(setItems).catch((e) => setErr(e.message)); }, []);
  if (!items) return <p className={s.muted}>{err || 'Loading your reviews…'}</p>;
  if (!items.length) return <EmptyState compact art={<LineArt type="receipt" />} status="No reviews yet" title="You haven’t reviewed anything yet" text="Review gear you bought from your order history or any product page." />;
  return (
    <ul className={s.myReviews}>
      {items.map((r) => {
        const p = getProduct(String(r.productId));
        const [label, tone] = REVIEW_STATUS[r.status] || REVIEW_STATUS.hidden;
        return (
          <li key={r.id}>
            <div className={s.rvHead}>
              <Rating value={r.rating} size={14} showValue={false} />
              <span className={`${s.status} ${tone}`}>{label}</span>
              {r.verified && <span className={s.verified}>Verified purchase</span>}
            </div>
            {r.title && <b className={s.rvTitle}>{r.title}</b>}
            <p>{r.text}</p>
            <small>{p ? <Link to={`/product/${p.slug}`} className="link">{r.product}</Link> : r.product} · {shortDate(r.date)}</small>
          </li>
        );
      })}
    </ul>
  );
}

function Alerts() {
  const { alerts, toggleAlert, setToast } = useStore();
  useCatalog();
  const items = alerts.map((id) => getProduct(id)).filter(Boolean);
  const remove = async (p) => { try { await toggleAlert(p.id); setToast(`Stopped watching ${p.name}`); } catch (e) { setToast(e.message); } };
  if (!items.length) return <EmptyState compact art={<LineArt type="bag" />} status="No alerts" title="You’re not waiting on anything" text="On a sold-out product, choose “Email me when it’s back in stock” and DMD will email you once it’s available again." />;
  return (
    <ul className={s.alerts}>
      {items.map((p) => (
        <li key={p.id}>
          <Link to={`/product/${p.slug}`} className={s.oThumb}><ProductImage product={p} /></Link>
          <span><Link to={`/product/${p.slug}`}><b>{p.name}</b></Link><small>{p.stock === 'out' ? <><BellIcon size={13} />Waiting · we’ll email you when it’s back</> : 'Back in stock now'}</small></span>
          <button type="button" className={s.iconBtn} onClick={() => remove(p)} aria-label={`Stop watching ${p.name}`}><TrashIcon size={16} /></button>
        </li>
      ))}
    </ul>
  );
}

const ADDR = [['address_1', 'Street address', 'address-line1', true], ['address_2', 'Building, floor', 'address-line2'], ['city', 'City', 'address-level2'], ['state', 'Area', 'address-level1'], ['postcode', 'Postal code', 'postal-code']];
function Profile() {
  const { buyer, setBuyer } = useStore();
  const init = () => ({ firstName: buyer.firstName, lastName: buyer.lastName, phone: buyer.phone, email: buyer.email, currentPassword: '', ...Object.fromEntries(ADDR.map(([k]) => [k, buyer.shipping[k] || buyer.billing[k] || ''])) });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (e) => { setF((x) => ({ ...x, [e.target.name]: e.target.value })); setMsg(null); };
  const emailChanged = f.email.trim().toLowerCase() !== buyer.email;
  const dirty = JSON.stringify({ ...f, currentPassword: '' }) !== JSON.stringify({ ...init(), currentPassword: '' });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const addr = Object.fromEntries(ADDR.map(([k]) => [k, f[k].trim()]));
      const name = { first_name: f.firstName.trim(), last_name: f.lastName.trim() };
      const b = LARAVEL
        ? await account.updateProfile({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(), ...(emailChanged ? { email: f.email.trim(), currentPassword: f.currentPassword } : {}) })
        : await storeApi.put('/me', { firstName: f.firstName, lastName: f.lastName, phone: f.phone, shipping: { ...addr, ...name, country: 'LB' }, billing: { ...addr, ...name, country: 'LB' }, ...(emailChanged ? { email: f.email, currentPassword: f.currentPassword } : {}) });
      setBuyer(b); setF((x) => ({ ...x, currentPassword: '' }));
      setMsg({ ok: true, text: LARAVEL ? 'Saved.' : 'Saved. Your details will be filled in at checkout.' });
    } catch (x) { setMsg({ ok: false, text: x.message }); }
    setBusy(false);
  };
  return (
    <form className={s.form} onSubmit={save} noValidate>
      <fieldset>
        <legend>Your details</legend>
        <div className={s.two}>
          <div className="field"><label htmlFor="pf-first">First name</label><input id="pf-first" name="firstName" className="input" value={f.firstName} onChange={set} autoComplete="given-name" /></div>
          <div className="field"><label htmlFor="pf-last">Last name</label><input id="pf-last" name="lastName" className="input" value={f.lastName} onChange={set} autoComplete="family-name" /></div>
          <div className="field"><label htmlFor="pf-email">Email (sign-in)</label><input id="pf-email" name="email" type="email" className="input" value={f.email} onChange={set} autoComplete="email" /></div>
          <div className="field"><label htmlFor="pf-phone">Phone</label><input id="pf-phone" name="phone" type="tel" className="input" value={f.phone} onChange={set} autoComplete="tel" placeholder="+961 …" /></div>
        </div>
        {emailChanged && <PasswordField label="Current password (to change your email)" value={f.currentPassword} onChange={(v) => setF((x) => ({ ...x, currentPassword: v }))} autoComplete="current-password" />}
      </fieldset>
      {!LARAVEL && (
        <fieldset>
          <legend>Delivery address</legend>
          <div className={s.two}>
            {ADDR.map(([k, label, auto, wide]) => <div key={k} className={`field ${wide ? s.wide : ''}`}><label htmlFor={`pf-${k}`}>{label}</label><input id={`pf-${k}`} name={k} className="input" value={f[k]} onChange={set} autoComplete={auto} /></div>)}
          </div>
        </fieldset>
      )}
      {msg && <p className={msg.ok ? s.okMsg : s.err} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div className={s.formActions}>
        <button type="submit" className="btn btn--primary" disabled={busy || !dirty || !f.firstName.trim() || !f.lastName.trim() || !isEmail(f.email) || (emailChanged && !f.currentPassword)}>{busy ? 'Saving…' : 'Save details'}</button>
        <span className={s.muted}>Member since {longDate(buyer.since)}</span>
      </div>
    </form>
  );
}

function Security() {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };
  const ready = f.current && passwordReady(f.next) && f.next === f.confirm && f.next !== f.current;
  const save = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setMsg(null);
    try { await (LARAVEL ? account.changePassword(f) : storeApi.post('/me/password', f)); setF({ current: '', next: '', confirm: '' }); setMsg({ ok: true, text: 'Password changed. Any other devices signed in to your account were signed out.' }); } catch (x) { setMsg({ ok: false, text: x.message }); }
    setBusy(false);
  };
  return (
    <form className={s.form} onSubmit={save} noValidate>
      <fieldset>
        <legend>Change password</legend>
        <div className={s.narrow}>
          <PasswordField label="Current password" value={f.current} onChange={set('current')} autoComplete="current-password" />
          <PasswordField label="New password" value={f.next} onChange={set('next')} autoComplete="new-password" describedBy="sec-rules" invalid={f.next && !passwordReady(f.next)} />
          <PasswordRules id="sec-rules" password={f.next} />
          <PasswordField label="Confirm new password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" describedBy="sec-match" invalid={f.confirm && f.confirm !== f.next}>
            <MatchHint id="sec-match" password={f.next} confirm={f.confirm} />
          </PasswordField>
          {f.next && f.current && f.next === f.current && <p className={s.err}>Choose a password that’s different from your current one.</p>}
        </div>
      </fieldset>
      {msg && <p className={msg.ok ? s.okMsg : s.err} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div className={s.formActions}><button type="submit" className="btn btn--primary" disabled={!ready || busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
    </form>
  );
}

const HELP = [
  ['Delivery', `Delivery cost and timing are confirmed by DMD after you place your order. Call ${CONTACT.phone} or email ${CONTACT.email}.`],
  ['Returns & warranty', 'Please contact the store with your order number for returns or warranty questions.'],
  ['Payments', 'Pay cash on delivery or by bank transfer. DMD confirms every order with you before it ships.'],
];
const TABS = [['orders', 'Order history'], ['messages', 'Messages'], ['reviews', 'My reviews'], ['alerts', 'Stock alerts'], ['profile', 'Profile & address'], ['security', 'Password'], ['help', 'Shipping & returns']];

export default function Account() {
  usePageMeta({ title: 'Your account', noindex: true });
  const { buyer, checking, signOut, orders, wishlist, unread, alerts } = useStore();
  const [params, setParams] = useSearchParams();
  if (checking) return <div className={`container ${s.auth}`}><p className={s.muted} role="status">Checking your account…</p></div>;
  if (!buyer) return <SignIn />;
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'orders';
  const go = (t) => setParams({ tab: t });
  const ordersCount = orders.length;
  const name = `${buyer.firstName} ${buyer.lastName}`.trim() || buyer.email;
  const first = name.trim()[0].toUpperCase();
  const initial = /[A-Z0-9]/.test(first) ? first : '?'; // the pixel font only has Latin letters and digits
  const card = (
    <div className={s.player}>
      <div className={s.avatar} aria-hidden="true"><PixelText text={initial} className={s.avatarPx} cellClass={s.avatarOn} /></div>
      <div className={s.playerTxt}><small>Player 1</small><b>{name}</b><span>{buyer.email}</span></div>
      <dl className={s.playerStats}>
        <div><dt>Orders</dt><dd>{ordersCount}</dd></div>
        <div><dt>Saved</dt><dd>{wishlist.length}</dd></div>
      </dl>
    </div>
  );
  return (
    <>
      <PageHero crumbs={[{ label: 'Home', to: '/' }, { label: 'Account' }]} eyebrow="Player profile" title={`Hi, ${buyer.firstName || name}`} aside={card}>
        <button type="button" className={`btn btn--ghost btn--sm ${s.signOut}`} onClick={signOut}>Sign out</button>
      </PageHero>
      <div className={`container ${s.layout}`}>
        <nav className={s.nav} aria-label="Account">
          {TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? s.on : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{l}{k === 'messages' && unread > 0 && <em className={s.badge} aria-label={`${unread} unread`}>{unread}</em>}{k === 'alerts' && alerts.length > 0 && <em>{alerts.length}</em>}</button>)}
          <Link to="/wishlist">Wishlist <em>{wishlist.length}</em></Link>
        </nav>
        <section className={s.content}>
          <h2>{TABS.find(([k]) => k === tab)[1]}</h2>
          {tab === 'orders' && <Orders />}
          {tab === 'messages' && (LARAVEL ? <LaravelMessages /> : <Messages />)}
          {tab === 'reviews' && <MyReviews />}
          {tab === 'alerts' && <Alerts />}
          {tab === 'profile' && <Profile key={buyer.email} />}
          {tab === 'profile' && LARAVEL && <section className={s.form} aria-labelledby="addr-title"><fieldset><legend id="addr-title">Delivery addresses</legend><AddressBook buyer={buyer} /></fieldset></section>}
          {tab === 'security' && <Security />}
          {tab === 'help' && <div className={s.help}>{HELP.map(([t, b]) => <div key={t}><h3>{t}</h3><p>{b}</p></div>)}</div>}
        </section>
      </div>
    </>
  );
}
