import { useEffect, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, dateTime, money } from '../lib/format.js';
import { Avatar, Button, Chip, Empty, Icon, Notice, SearchBox, SkeletonRows, StatusChip, Tabs, useUi } from '../ui/kit.jsx';

/* Owner ↔ buyer conversations (one per order, or a general question) and live chats from the bubble on the shop
   (guests too). Customers write from their account; replies are emailed to them and show in their account. A live chat
   reply appears in the visitor's chat window within seconds. The list and the open chat refresh on their own. */
const LIST_EVERY = 10e3;
const THREAD_EVERY = 4e3;
/** Calls `fn` every `ms` while the admin tab is visible (and once when it comes back into view). */
function useEvery(fn, ms) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; }, [fn]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') saved.current(); };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
}
export default function Messages({ params, query }) {
  const filter = query.get('filter') || 'all';
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const qs = new URLSearchParams({ per_page: '50' });
  if (filter === 'unread') qs.set('unread', '1');
  if (dq.trim()) qs.set('q', dq.trim());
  const { data, error, reload } = useApi(`/conversations?${qs}`);
  useEvery(() => reload(true), LIST_EVERY);
  const id = params.id ? Number(params.id) : null;
  const items = data?.data || [];
  const unread = data?.meta?.unread || 0;

  return (
    <div className={`inbox ${id ? 'has-thread' : ''}`}>
      <section className="surface inbox-list" aria-label="Conversations">
        <div className="inbox-head">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 20 }}>Messages</h1>
            <Tabs label="Filter" value={filter} onChange={(v) => setQuery({ filter: v === 'all' ? null : v })} items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread, led: unread ? 'blue' : undefined }]} />
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Name, email, subject or order number" />
        </div>
        {error && <div style={{ padding: 12 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows rows={5} /> : !items.length ? (
          <Empty icon="chat" title={filter === 'unread' ? 'You’re all caught up' : 'No conversations yet'}>{filter === 'unread' ? 'No unread messages.' : 'When someone chats from the shop or a customer writes from their account, it lands here.'}</Empty>
        ) : (
          <ul className="threads">
            {items.map((t) => (
              <li key={t.id}>
                <a href={`#/messages/${t.id}${filter === 'unread' ? '?filter=unread' : ''}`} className={`thread ${t.id === id ? 'on' : ''} ${t.unread ? 'unread' : ''}`}>
                  <Avatar name={t.customer?.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}><b className="clamp1 grow">{t.customer?.name || 'Customer'}</b>{t.channel === 'chat' && <Chip tone="blue">Live chat</Chip>}<small className="mono muted" style={{ flex: 'none' }}>{ago(t.last_message_at)}</small></span>
                    <span className="clamp1 t-prev">{t.last_message ? `${t.last_message.from === 'admin' ? 'You: ' : ''}${t.last_message.excerpt}` : ''}</span>
                    <small className="mono muted">{t.order ? `#${t.order.number}` : t.subject}{t.last_message?.from === 'admin' ? (t.seen_by_customer ? ' · seen' : ' · replied') : ''}</small>
                  </span>
                  {t.unread && <span className="led blue" aria-label="Unread" />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="surface inbox-thread" aria-label="Conversation">
        {id ? <Thread key={id} id={id} filter={filter} /> : (
          <div className="empty" style={{ height: '100%', alignContent: 'center' }}>
            <Icon name="chat" /><h3>Pick a conversation</h3>
            <p>Live chats from the shop and customers’ messages from their account land here. Open one to reply.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ id, filter }) {
  const { toast, fail } = useUi();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { api.get(`/conversations/${id}`).then((r) => { setD(r.data); changed('messages'); }).catch(setErr); }, [id]);
  // New messages while it's open (a live chat especially): only re-rendered when something new arrived.
  useEvery(() => api.get(`/conversations/${id}`).then((r) => setD((cur) => (cur && r.data.messages.length === cur.messages.length ? cur : r.data))).catch(() => {}), THREAD_EVERY);
  const count = d?.messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count]);
  if (err) return <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{err.message}</Notice></div>;
  if (!d) return <SkeletonRows rows={4} />;
  const c = d.customer || {};
  const o = d.order;
  const first = (c.name || '').split(' ')[0] || 'the customer';
  const chat = d.channel === 'chat';
  // Where a reply shows up for them: the chat window (and email, if they gave one), or their account and email.
  const where = chat ? (c.guest ? (c.email ? 'in their chat window and by email' : 'in their chat window') : 'in their chat window, account and email') : 'by email and in their account';
  const send = async (e) => {
    e?.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await api.post(`/conversations/${id}/messages`, { body: text });
      setD(r.data);
      setText('');
      changed('messages');
      toast(`Sent. ${first} sees it ${where}.`);
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const unread = async () => {
    try { await api.post(`/conversations/${id}/unread`); changed('messages'); navigate(`/messages${filter === 'unread' ? '?filter=unread' : ''}`); } catch (x) { fail(x); }
  };
  return (
    <>
      <header className="thread-head">
        <a className="btn sm quiet icon back-btn" href={`#/messages${filter === 'unread' ? '?filter=unread' : ''}`} aria-label="Back to conversations"><Icon name="back" /></a>
        <Avatar name={c.name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="clamp1">{c.id ? <a href={`#/customers/${c.id}`}>{c.name}</a> : c.name}{chat && <> <Chip tone="blue">{c.guest ? 'Live chat · guest' : 'Live chat'}</Chip></>}</b>
          <small className="muted clamp1" style={{ fontSize: 12 }}>{c.email || (c.guest ? 'No email given' : '')}{c.phone ? ` · ${c.phone}` : ''}</small>
        </div>
        <Button size="sm" variant="quiet" icon="eyeOff" onClick={unread} title="Mark as unread">Unread</Button>
      </header>
      {o ? (
        <a className="thread-order" href={`#/orders/${o.id}`}>
          <span className="grow" style={{ minWidth: 0 }}><b>Order #{o.number}</b> <span className="muted">· {money(o.total)} · {ago(o.placed_at)}</span>{o.customer_note && <span className="clamp1 muted" style={{ fontSize: 12 }}>Note at checkout: “{o.customer_note}”</span>}</span>
          <StatusChip status={o.status} />
        </a>
      ) : <div className="thread-order"><span className="grow"><b>{d.subject}</b></span></div>}
      <div className="bubbles">
        {d.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.from === 'admin' ? 'owner' : 'buyer'}`}>
            <p>{m.body}</p>
            <small>{m.from === 'buyer' ? first : m.from === 'admin' ? `${m.admin || 'You'} · shown ${where}` : 'Store'} · {dateTime(m.created_at)}</small>
          </div>
        ))}
        {!d.messages.length && <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>No messages yet. Write the first one below.</p>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        <textarea className="textarea" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} placeholder={`Reply to ${first}…`} aria-label="Reply" />
        <div className="row">
          <small className="muted grow" style={{ fontSize: 11.5 }}>{chat ? `Shown ${where}. They reply in the chat.` : 'Emailed to the customer and shown in their account. They reply from their account.'}</small>
          <span className="kbd-hint hide-sm">Ctrl ↵</span>
          <Button type="submit" variant="primary" icon="send" loading={busy} disabled={text.trim().length < 2}>Send</Button>
        </div>
      </form>
    </>
  );
}
