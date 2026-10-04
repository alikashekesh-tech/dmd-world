import { useEffect, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, dateTime, money, stripHtml } from '../lib/format.js';
import { Avatar, Button, Empty, Icon, Notice, SearchBox, SkeletonRows, StatusChip, Tabs, Thumb, useUi } from '../ui/kit.jsx';

/* Owner ↔ buyer conversations. Buyers write through the order note at checkout; the owner's replies are WooCommerce
   customer notes, which WooCommerce emails to the buyer. The buyer's answers come back by email. */
export default function Messages({ params, query }) {
  const filter = query.get('filter') || 'all';
  const { data, error } = useApi(`/messages${filter === 'unread' ? '?filter=unread' : ''}`);
  const [q, setQ] = useState('');
  const id = params.id ? Number(params.id) : null;
  const s = q.trim().toLowerCase();
  const items = (data?.items || []).filter((t) => !s || `${t.name} ${t.email} ${t.number} ${t.preview}`.toLowerCase().includes(s));

  return (
    <div className={`inbox ${id ? 'has-thread' : ''}`}>
      <section className="surface inbox-list" aria-label="Conversations">
        <div className="inbox-head">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 20 }}>Messages</h1>
            <Tabs label="Filter" value={filter} onChange={(v) => setQuery({ filter: v === 'all' ? null : v })} items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: data?.unread, led: data?.unread ? 'blue' : undefined }]} />
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Search conversations" />
        </div>
        {error && <div style={{ padding: 12 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {!data ? <SkeletonRows rows={5} /> : !items.length ? (
          <Empty icon="chat" title={filter === 'unread' ? 'You’re all caught up' : 'No conversations yet'}>{filter === 'unread' ? 'No unread messages.' : 'When a buyer leaves a note at checkout, it lands here.'}</Empty>
        ) : (
          <ul className="threads">
            {items.map((t) => (
              <li key={t.id}>
                <a href={`#/messages/${t.id}${filter === 'unread' ? '?filter=unread' : ''}`} className={`thread ${t.id === id ? 'on' : ''} ${t.unread ? 'unread' : ''}`}>
                  <Avatar name={t.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}><b className="clamp1 grow">{t.name}</b><small className="mono muted" style={{ flex: 'none' }}>{ago(t.at)}</small></span>
                    <span className="clamp1 t-prev">{t.preview}</span>
                    <small className="mono muted">#{t.number}{t.replied ? ' · replied' : ''}</small>
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
            <p>Buyers write to you at checkout or from their account. Your replies are emailed to them and appear in their account.</p>
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
  useEffect(() => { api.get(`/messages/${id}`).then((r) => { setD(r); changed('messages'); }).catch(setErr); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [d]);
  if (err) return <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{err.message}</Notice></div>;
  if (!d) return <SkeletonRows rows={4} />;
  const o = d.order;
  const name = `${o.billing.first_name || ''} ${o.billing.last_name || ''}`.trim() || o.billing.email;
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const m = await api.post(`/messages/${id}`, { text });
      setD((x) => ({ ...x, thread: [...x.thread, m] }));
      setText('');
      changed('messages');
      toast(`Sent. WooCommerce emails it to ${o.billing.email}.`);
    } catch (x) { fail(x); }
    setBusy(false);
  };
  const unread = async () => {
    try { await api.post(`/messages/${id}/unread`); changed('messages'); navigate(`/messages${filter === 'unread' ? '?filter=unread' : ''}`); } catch (x) { fail(x); }
  };
  return (
    <>
      <header className="thread-head">
        <a className="btn sm quiet icon back-btn" href={`#/messages${filter === 'unread' ? '?filter=unread' : ''}`} aria-label="Back to conversations"><Icon name="back" /></a>
        <Avatar name={name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="clamp1">{name}</b>
          <small className="muted clamp1" style={{ fontSize: 12 }}>{o.billing.email}{o.billing.phone ? ` · ${o.billing.phone}` : ''}</small>
        </div>
        <Button size="sm" variant="quiet" icon="eyeOff" onClick={unread} title="Mark as unread">Unread</Button>
      </header>
      <a className="thread-order" href={`#/orders/${o.id}`}>
        <span className="stack-thumbs">{o.line_items.slice(0, 3).map((l) => <Thumb key={l.id} src={l.image?.src} />)}</span>
        <span className="grow" style={{ minWidth: 0 }}><b>Order #{o.number}</b> <span className="muted">· {money(o.total)} · {ago(o.date_created)}</span><span className="clamp1 muted" style={{ fontSize: 12 }}>{o.line_items.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span></span>
        <StatusChip status={o.status} />
      </a>
      <div className="bubbles">
        {d.thread.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>
            <p>{stripHtml(m.text)}</p>
            <small>{m.from === 'buyer' ? `${o.billing.first_name || 'Buyer'} · ${m.via === 'account' ? 'from their account' : 'at checkout'}` : 'You · emailed and shown in their account'} · {dateTime(m.at)}</small>
          </div>
        ))}
        {!d.thread.length && <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>No messages on this order yet. Write the first one below.</p>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} placeholder={`Reply to ${o.billing.first_name || 'the buyer'}…`} aria-label="Reply" />
        <div className="row">
          <small className="muted grow" style={{ fontSize: 11.5 }}>Emailed to the buyer and shown in their account. They can reply from their account or by email.</small>
          <span className="kbd-hint hide-sm">Ctrl ↵</span>
          <Button type="submit" variant="primary" icon="send" loading={busy} disabled={!text.trim()}>Send</Button>
        </div>
      </form>
    </>
  );
}
