import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { laravelApi } from '../../lib/laravelApi.js';
import { STORE_LOCATION } from '../../data/dmdMenu.js';
import { STORE } from '../../data/index.js';
import { useCatalog } from '../../data/live.js';
import Assistant from './Assistant.jsx';
import { CloseIcon } from '../common/icons.jsx';
import { useWhatsAppLink, WhatsAppIcon } from './WhatsAppButton.jsx';
import s from './LiveChat.module.css';

/* One contact button (bottom-right, every page): it offers Live chat or WhatsApp.
   Live chat with the store, from any page. A signed-in buyer chats as themselves; a guest gives a name (and an
   email if they'd like replies by email too) and their browser keeps the private key to this chat. The owner and
   staff answer from Admin › Messages. While open it asks for new messages every few seconds; while closed, now and
   then, to show a dot when the store has replied. */
const TOKEN = 'dmd:chat-token';
const OPEN_EVERY = 4000;
const CLOSED_EVERY = 30000;
const readToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };
const saveToken = (t) => { try { localStorage.setItem(TOKEN, t); } catch { /* private mode: the chat lasts this visit */ } };
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function LiveChat() {
  const { buyer } = useStore();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).get('chat') === '1'); // from the reply email
  const [picking, setPicking] = useState(false); // the Live chat / WhatsApp choice is showing
  const [asking, setAsking] = useState(false); // the shopping assistant is open
  useCatalog(); // the assistant is offered once the store's settings say so
  const whatsApp = useWhatsAppLink();
  const picker = useRef(null);
  const [token, setToken] = useState(readToken);
  const [chat, setChat] = useState({ started: false, unread: false, messages: [] });
  const [form, setForm] = useState({ name: '', email: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const lastId = chat.messages.length ? chat.messages[chat.messages.length - 1].id : 0;
  const known = !!buyer || !!token; // someone who may already have a chat
  const headers = token ? { 'X-Chat-Token': token } : {};

  const merge = useCallback((d) => setChat((c) => {
    const have = new Set(c.messages.map((m) => m.id));
    return { started: d.started, unread: d.unread, messages: [...c.messages, ...d.messages.filter((m) => !have.has(m.id))] };
  }), []);

  const refresh = useCallback(async (read) => {
    if (!known || document.visibilityState !== 'visible') return;
    try { merge((await laravelApi.get(`/chat?after=${lastId}${read ? '&read=1' : ''}`, { headers })).data); } catch { /* offline: try again next time */ }
  }, [known, lastId, token, merge]); // eslint-disable-line react-hooks/exhaustive-deps -- `headers` follows `token`

  // Signing in or out makes it someone else's chat: start from theirs. (A guest's first message sets the key and
  // already shows the messages, so that alone doesn't reset anything.)
  const who = useRef(buyer?.id);
  useEffect(() => {
    if (who.current === buyer?.id) return;
    who.current = buyer?.id;
    setChat({ started: false, unread: false, messages: [] });
  }, [buyer?.id]);
  useEffect(() => { refresh(open); }, [buyer?.id, token, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!known) return undefined;
    const t = setInterval(() => refresh(open), open ? OPEN_EVERY : CLOSED_EVERY);
    return () => clearInterval(t);
  }, [known, open, refresh]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [open, chat.messages.length]);
  useEffect(() => {
    if (!open && !picking && !asking) return undefined;
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setPicking(false); setAsking(false); } };
    // A click anywhere else closes the choice (not the chat: people scroll and click around while waiting).
    const away = (e) => { if (picking && !picker.current?.contains(e.target)) setPicking(false); };
    window.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', away);
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', away); };
  }, [open, picking, asking]);
  useEffect(() => { setPicking(false); }, [pathname]);

  const send = async (e) => {
    e.preventDefault();
    const body = form.body.trim();
    if (body.length < 2 || busy) return;
    if (!chat.started && !buyer && form.name.trim().length < 2) { setError('Tell us your name so we know who we’re talking to.'); return; }
    setBusy(true); setError('');
    try {
      const r = await laravelApi.post('/chat/messages', { body, after: lastId, ...(chat.started || buyer ? {} : { name: form.name.trim(), email: form.email.trim() || null }) }, { headers });
      if (r.meta?.token) { saveToken(r.meta.token); setToken(r.meta.token); }
      merge(r.data);
      setForm((f) => ({ ...f, body: '' }));
    } catch (x) { setError(x.fields ? Object.values(x.fields)[0]?.[0] || x.message : x.message); }
    setBusy(false);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const raised = pathname.startsWith('/product/'); // above the product page's buy bar on phones
  // Closes the chat; or, with a reply waiting, goes straight back to it; otherwise offers Live chat or WhatsApp.
  const toggle = () => { if (open) setOpen(false); else if (asking) setAsking(false); else if (chat.unread) setOpen(true); else setPicking((p) => !p); };
  // From the assistant to a person: the live chat opens with the question already written.
  const toPerson = (question) => { setAsking(false); setOpen(true); if (question) setForm((f) => ({ ...f, body: f.body || question })); };

  return (
    <>
      <div ref={picker} className={s.launcher} data-raised={raised || undefined}>
        {picking && (
          <ul className={s.choices} aria-label="Contact DMD World">
            {STORE.assistant && (
              <li><button type="button" className={s.choice} onClick={() => { setPicking(false); setAsking(true); }}>
                <span>Shopping assistant<small>Instant answers from our catalog</small></span>
                <i className={s.chatIcon}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /><path d="M11 8v6M8 11h6" /></svg></i>
              </button></li>
            )}
            <li><button type="button" className={s.choice} onClick={() => { setPicking(false); setOpen(true); }}>
              <span>Live chat<small>A person replies here</small></span>
              <i className={s.chatIcon}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9.5h8M8 12.5h5" /></svg></i>
            </button></li>
            <li><a className={s.choice} href={whatsApp} target="_blank" rel="noopener noreferrer" onClick={() => setPicking(false)}>
              <span>WhatsApp<small>Opens WhatsApp</small></span>
              <i className={s.waIcon}><WhatsAppIcon size={24} /></i>
            </a></li>
          </ul>
        )}
        <button type="button" className={s.bubble} onClick={toggle} aria-expanded={open || picking || asking} aria-controls={open ? 'live-chat' : undefined}
          aria-label={open ? 'Close the chat' : asking ? 'Close the assistant' : picking ? 'Close' : chat.unread ? 'Contact DMD World (new reply in your chat)' : 'Contact DMD World'}>
          {open || picking || asking ? <CloseIcon size={24} /> : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9.5h8M8 12.5h5" />
            </svg>
          )}
          {!open && !picking && !asking && chat.unread && <i className={s.dot} aria-hidden="true" />}
        </button>
      </div>

      {asking && !open && <Assistant onClose={() => setAsking(false)} onPerson={toPerson} />}

      {open && (
        <section id="live-chat" className={s.panel} data-raised={raised || undefined} data-started={chat.started || undefined} role="dialog" aria-label="Live chat with DMD World">
          <header className={s.head}>
            <span className={s.avatar} aria-hidden="true"><img src="/apple-touch-icon.png" alt="" width="40" height="40" /><i /></span>
            <div className={s.title}><b>DMD World</b><small>Online · daily {STORE_LOCATION.hours.replace('Open daily: ', '').replace(/:00 /g, ' ')}</small></div>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close the chat"><CloseIcon size={18} /></button>
          </header>

          {!chat.started ? (
            /* Before the first message: a short hello and one simple form. */
            <form className={s.start} onSubmit={send}>
              <p className={s.hello}><b>Hi{buyer?.firstName ? ` ${buyer.firstName}` : ''}!</b>Ask us about compatibility, stock or an order. A person from the store answers right here{buyer ? '' : ', and by email too if you leave yours'}.</p>
              {!buyer && (
                <div className={s.pair}>
                  <label className={s.field}><span>Your name</span><input value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} required /></label>
                  <label className={s.field}><span>Email <em>(optional)</em></span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} /></label>
                </div>
              )}
              <label className={s.field}><span>Message</span><textarea value={form.body} onChange={set('body')} rows={3} maxLength={2000} placeholder="How can we help?"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} /></label>
              {error && <p className={s.error} role="alert">{error}</p>}
              <button type="submit" className={`btn btn--primary ${s.startBtn}`} disabled={busy || form.body.trim().length < 2 || (!buyer && form.name.trim().length < 2)}>{busy ? 'Sending…' : 'Start chat'}</button>
            </form>
          ) : (
            <>
              <div className={s.body} aria-live="polite">
                {chat.messages.map((m) => (
                  <div key={m.id} className={`${s.msg} ${m.from === 'you' ? s.you : s.store}`}>
                    <p>{m.body}</p>
                    <small>{m.from === 'you' ? 'You' : m.by || 'DMD World'} · {timeOf(m.at)}</small>
                  </div>
                ))}
                {chat.messages.length > 0 && chat.messages[chat.messages.length - 1].from === 'you' && (
                  <p className={s.wait}>Sent. We’ll reply here as soon as someone is free{!buyer && form.email ? ', and by email' : ''}.</p>
                )}
                <div ref={end} />
              </div>
              <form className={s.compose} onSubmit={send}>
                <textarea value={form.body} onChange={set('body')} rows={1} maxLength={2000} placeholder="Write a message…" aria-label="Your message"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
                <button type="submit" className={s.send} disabled={busy || form.body.trim().length < 2} aria-label="Send">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 3-9.5 9.5" /><path d="M21 3 14.5 21l-3-8.5L3 9.5 21 3Z" /></svg>
                </button>
                {error && <p className={s.error} role="alert">{error}</p>}
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}
