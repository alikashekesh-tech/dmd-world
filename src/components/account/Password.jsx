import { useId, useState } from 'react';
import { checkPassword } from '../../../shared/passwordPolicy.js';
import s from './Password.module.css';

const Eye = ({ off }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.4 6.4A17.4 17.4 0 0 0 2.5 12S6 19 12 19a9.9 9.9 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
      : <><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>
);
const Tick = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Cross = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;

/** A labelled password input with a show/hide button. */
export function PasswordField({ label, value, onChange, autoComplete = 'current-password', invalid, describedBy, name, autoFocus, children }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className={s.wrap}>
        <input id={id} name={name} className="input" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={describedBy} autoFocus={autoFocus} />
        <button type="button" className={s.eye} onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}><Eye off={shown} /></button>
      </span>
      {children}
    </div>
  );
}

/** The shared password rules as a live checklist: neutral until you start typing, then met / still needed. */
export function PasswordRules({ password, id }) {
  const typed = password.length > 0;
  const rules = checkPassword(password);
  const met = rules.filter((r) => r.ok).length;
  return (
    <div className={s.rules} id={id}>
      <p className={s.rulesHead}>Your password needs</p>
      <ul>
        {rules.map((r) => (
          <li key={r.id} className={!typed ? '' : r.ok ? s.ok : s.no}>
            <span className={s.mark}>{typed ? (r.ok ? <Tick /> : <Cross />) : null}</span>
            {r.label}<span className="sr-only">{typed ? (r.ok ? ' (done)' : ' (still needed)') : ''}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">{typed ? (met === rules.length ? 'All password requirements met.' : `${met} of ${rules.length} password requirements met.`) : ''}</p>
    </div>
  );
}

/** "Passwords match" / "Doesn't match yet" under the confirm field. */
export function MatchHint({ password, confirm, id }) {
  if (!confirm) return <span id={id} />;
  const same = confirm === password;
  return <span id={id} className={`${s.match} ${same ? s.ok : s.no}`} aria-live="polite">{same ? <Tick /> : <Cross />}{same ? 'Passwords match' : 'Doesn’t match yet'}</span>;
}

export const passwordReady = (p) => checkPassword(p).every((r) => r.ok);
