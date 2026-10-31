import { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { BellIcon, CloseIcon, MailIcon, CheckIcon } from '../common/icons.jsx';
import { WhatsAppIcon } from '../layout/WhatsAppButton.jsx';
import * as community from '../../lib/community.js';
import s from './NotifyMe.module.css';

/* "Notify me when it's available" for a sold-out product, or the sold-out variant the buyer chose. Guests and
   signed-in buyers alike, by email or WhatsApp, only with their consent. The request's private token stays on this
   device so it can be withdrawn here; a signed-in buyer also sees it in their account. Nothing is sent from here:
   DMD tells them once it's back (WhatsApp by the owner, until a messaging provider is set up). */

const KEY = 'dmd:stock-requests';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeSaved = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ } };

export default function NotifyMe({ p, variant = null, label = '' }) {
  const { buyer, alertFor, toggleAlert, refreshAlerts, setToast } = useStore();
  const key = community.alertKey(p.id, variant?.id);
  const [saved, setSaved] = useState(() => readSaved()[key] || null);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState('email');
  const [email, setEmail] = useState(buyer?.email || '');
  const [phone, setPhone] = useState(buyer?.phone || '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [badContact, setBadContact] = useState(false); // the error is about the email or number (not the consent box)
  useEffect(() => { setSaved(readSaved()[key] || null); setOpen(false); setError(null); }, [key]);
  useEffect(() => { if (buyer) { setEmail((v) => v || buyer.email || ''); setPhone((v) => v || buyer.phone || ''); } }, [buyer]);

  const name = label ? `${p.name} (${label})` : p.name;
  const account = buyer ? alertFor(p.id, variant?.id) : null; // a signed-in buyer's request, from the server
  const waiting = account || saved;
  const how = (waiting?.channel || 'email') === 'email' ? 'by email' : 'on WhatsApp';

  const submit = async (e) => {
    e.preventDefault();
    if (!consent) { setError('Tick the box so DMD may contact you about this product.'); setBadContact(false); return; }
    setBusy(true); setError(null); setBadContact(false);
    try {
      const r = await community.alerts.request({
        product_id: Number(p.id), variant_id: variant ? Number(variant.id) : null, channel, consent: true,
        ...(channel === 'email' ? { email: email.trim() } : { phone: phone.trim() }),
      });
      const mine = { token: r.token, channel: r.channel };
      writeSaved({ ...readSaved(), [key]: mine });
      setSaved(mine); setOpen(false); setConsent(false);
      if (buyer) refreshAlerts().catch(() => {});
      setToast(`We’ll let you know ${channel === 'email' ? 'by email' : 'on WhatsApp'} when ${name} is back`);
    } catch (err) {
      setError(err.fields?.email || err.fields?.phone || err.fields?.consent || err.message);
      setBadContact(!!(err.fields?.email || err.fields?.phone));
    }
    setBusy(false);
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      if (saved?.token) await community.alerts.cancel(saved.token).catch((err) => { if (err.status !== 404) throw err; });
      else if (account) await toggleAlert(p.id, variant?.id);
      const all = readSaved(); delete all[key]; writeSaved(all);
      setSaved(null);
      if (buyer) await refreshAlerts().catch(() => {});
      setToast('Back-in-stock request withdrawn');
    } catch (err) { setToast(err.message); }
    setBusy(false);
  };

  if (waiting) {
    return (
      <div className={s.done} role="status">
        <span className={s.doneIcon}><CheckIcon size={16} /></span>
        <p><b>We’ll let you know {how}</b> when {name} is back in stock.</p>
        <button type="button" className={s.link} onClick={withdraw} disabled={busy}>Withdraw</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => setOpen(true)} aria-expanded="false">
        <BellIcon size={17} />Notify me when it’s available
      </button>
    );
  }

  return (
    <form className={s.panel} onSubmit={submit} noValidate aria-label="Notify me when it’s available">
      <div className={s.head}>
        <b><BellIcon size={16} />Notify me when it’s available</b>
        <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close"><CloseIcon size={16} /></button>
      </div>
      <p className={s.what}>{name}</p>
      <div className={s.seg} role="radiogroup" aria-label="How should we tell you?">
        <button type="button" role="radio" aria-checked={channel === 'email'} className={channel === 'email' ? s.on : ''} onClick={() => { setChannel('email'); setError(null); }}><MailIcon size={15} />Email</button>
        <button type="button" role="radio" aria-checked={channel === 'whatsapp'} className={channel === 'whatsapp' ? s.on : ''} onClick={() => { setChannel('whatsapp'); setError(null); }}><WhatsAppIcon size={15} />WhatsApp</button>
      </div>
      {channel === 'email' ? (
        <div className="field">
          <label htmlFor="notify-email">Email</label>
          <input id="notify-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required aria-invalid={badContact || undefined} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="notify-phone">WhatsApp number</label>
          <input id="notify-phone" className="input" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 70 123 456" required aria-invalid={badContact || undefined} aria-describedby="notify-phone-hint" />
          <small id="notify-phone-hint" className={s.hint}>A Lebanese number can be typed as 70 123 456. For another country, start with + and its code.</small>
        </div>
      )}
      <label className={s.check}>
        <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(null); }} />
        <span>I agree that DMD World may contact me {channel === 'email' ? 'by email' : 'on WhatsApp'} once, when this is back in stock. Nothing else.</span>
      </label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Notify me'}</button>
    </form>
  );
}
