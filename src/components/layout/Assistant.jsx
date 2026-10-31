import { useEffect, useRef, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { laravelApi } from '../../lib/laravelApi.js';
import { money } from '../../data/index.js';
import { CloseIcon } from '../common/icons.jsx';
import { whatsAppUrl, WhatsAppIcon } from './WhatsAppButton.jsx';
import s from './LiveChat.module.css';
import a from './Assistant.module.css';

/* The shopping assistant, opened from the contact button beside Live chat and WhatsApp. It answers from DMD World's
   own catalog and settings (the server never makes up a price, stock or a policy) and hands anything else to a
   person: live chat (the question is carried over) or WhatsApp. Nothing is saved: the conversation lasts this visit. */
const SUGGESTIONS = ['Gaming chairs under $200', 'Headsets in stock', 'How much is delivery?', 'هل عندكم يد تحكم؟'];
const STOCK = { in_stock: ['In stock', 'متوفر'], low_stock: ['Only a few left', 'كمية محدودة'], out_of_stock: ['Sold out', 'نفد'] };

export default function Assistant({ onClose, onPerson }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const lastQuestion = [...messages].reverse().find((m) => m.from === 'you')?.text || '';
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    setMessages((m) => [...m, { id: Date.now(), from: 'you', text: q }]);
    setText(''); setBusy(true); setError('');
    try {
      const { data } = await laravelApi.post('/assistant', { message: q });
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'assistant', ...data }]);
    } catch (x) { setError(x.fields?.message || x.message); }
    setBusy(false);
  };
  const submit = (e) => { e.preventDefault(); ask(text); };

  return (
    <section id="assistant" className={s.panel} data-started role="dialog" aria-label="Shopping assistant">
      <header className={s.head}>
        <span className={s.avatar} aria-hidden="true"><img src="/apple-touch-icon.png" alt="" width="40" height="40" /></span>
        <div className={s.title}><b>Shopping assistant</b><small>Answers from DMD World’s catalog</small></div>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close the assistant"><CloseIcon size={18} /></button>
      </header>
      <div className={s.body} aria-live="polite">
        <div className={`${s.msg} ${s.store}`}>
          <p dir="auto">Ask about a product, a price or delivery and I’ll look in our store. يمكنك السؤال بالعربية أيضاً.</p>
        </div>
        {!messages.length && (
          <div className={a.suggest}>
            {SUGGESTIONS.map((q) => <button key={q} type="button" dir="auto" onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        {messages.map((m) => (m.from === 'you' ? (
          <div key={m.id} className={`${s.msg} ${s.you}`}><p dir="auto">{m.text}</p></div>
        ) : (
          <div key={m.id} className={`${s.msg} ${s.store} ${a.answer}`} lang={m.locale} dir={m.locale === 'ar' ? 'rtl' : 'ltr'}>
            <p>{m.reply}</p>
            {m.products?.length > 0 && (
              <ul className={a.products}>
                {m.products.map((p) => (
                  <li key={p.id}>
                    <Link to={p.url} onClick={onClose}>
                      {p.image ? <img src={p.image} alt="" width="44" height="44" loading="lazy" /> : <span className={a.noImg} aria-hidden="true" />}
                      <span><b>{p.name}</b><small>{p.from ? (m.locale === 'ar' ? 'من ' : 'From ') : ''}{money(p.price)}{p.on_sale && p.regular_price > p.price ? <del>{money(p.regular_price)}</del> : null} · {(STOCK[p.availability] || STOCK.in_stock)[m.locale === 'ar' ? 1 : 0]}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <small>{m.source === 'ai' ? 'Assistant · from our catalog' : 'Assistant'}</small>
          </div>
        )))}
        {busy && <p className={s.wait}>Looking in the store…</p>}
        {messages.length > 0 && (
          <div className={a.person}>
            <span>Need a person?</span>
            <button type="button" onClick={() => onPerson(lastQuestion)}>Live chat</button>
            <a href={whatsAppUrl(lastQuestion ? `Hello DMD World! ${lastQuestion}` : 'Hello DMD World!')} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={15} />WhatsApp</a>
          </div>
        )}
        <div ref={end} />
      </div>
      <form className={s.compose} onSubmit={submit}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={300} dir="auto" placeholder="Ask about a product…" aria-label="Your question"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }} />
        <button type="submit" className={s.send} disabled={busy || text.trim().length < 2} aria-label="Ask">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 3-9.5 9.5" /><path d="M21 3 14.5 21l-3-8.5L3 9.5 21 3Z" /></svg>
        </button>
        {error && <p className={s.error} role="alert">{error}</p>}
      </form>
    </section>
  );
}
