import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import PixelText from '../components/ui/PixelText.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { ArrowRight } from '../components/common/icons.jsx';
import { PasswordField, PasswordRules, MatchHint, passwordReady } from '../components/account/Password.jsx';
import { storeApi } from '../lib/storeApi.js';
import { LARAVEL } from '../lib/backend.js';
import { account } from '../lib/account.js';
import { usePageMeta } from '../lib/meta.js';
import s from './Account.module.css';

/* Opened from the reset email: choose a new password (same rules as sign-up), then you're signed in. */
export default function ResetPassword() {
  usePageMeta({ title: 'Choose a new password', noindex: true });
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [email] = useState(() => params.get('email') || ''); // Laravel's links carry the account email too
  // The token (and email) leave the address bar at once, so they aren't kept in history or shared by accident.
  useEffect(() => { if (params.get('token')) window.history.replaceState(window.history.state, '', '/account/reset'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [valid, setValid] = useState(null);
  const [f, setF] = useState({ password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token || (LARAVEL && !email)) { setValid(false); return; }
    (LARAVEL ? account.resetValid({ token, email }) : storeApi.get(`/password/reset?token=${encodeURIComponent(token)}`).then((r) => r.valid))
      .then(setValid).catch(() => setValid(false));
  }, [token, email]);
  const ready = passwordReady(f.password) && f.password === f.confirm;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try {
      const buyer = LARAVEL
        ? await account.reset({ token, email, password: f.password, confirm: f.confirm })
        : (await storeApi.post('/password/reset', { token, password: f.password, confirm: f.confirm })).buyer;
      await signedIn(buyer);
      nav('/account');
    } catch (x) { setErr(x.message); if (x.code === 'reset_expired' || x.code === 'RESET_LINK_INVALID') setValid(false); }
    setBusy(false);
  };
  return (
    <div className={`container ${s.auth}`}>
      <div className={s.authPanel}>
        <div className={s.authStage}>
          <p className={s.hud}>Continue?</p>
          <PixelText text="NEW KEY" className={s.press} cellClass={s.pressOn} />
          <div className={s.authArt} aria-hidden="true"><LineArt type="controller" /></div>
          <p className={s.authNote}>Choosing a new password signs out every other device using your account.</p>
        </div>
        <div className={s.authCard}>
          <h1>Choose a new password</h1>
          {valid === null && <p role="status">Checking your link…</p>}
          {valid === false && (
            <div className={s.sent} role="alert">
              <b>This link has expired</b>
              <p>Reset links work once, for 60 minutes. Ask for a new one and use the newest email.</p>
              <Link to="/account" className="btn btn--secondary btn--block">Back to sign in</Link>
            </div>
          )}
          {valid && (
            <>
              <p>Pick something you don’t use anywhere else.</p>
              <form onSubmit={submit} noValidate>
                <PasswordField label="New password" value={f.password} onChange={(v) => { setF((x) => ({ ...x, password: v })); setErr(''); }} autoComplete="new-password" describedBy="rp-rules" invalid={f.password && !passwordReady(f.password)} autoFocus />
                <PasswordRules id="rp-rules" password={f.password} />
                <PasswordField label="Confirm new password" value={f.confirm} onChange={(v) => { setF((x) => ({ ...x, confirm: v })); setErr(''); }} autoComplete="new-password" describedBy="rp-match" invalid={f.confirm && f.confirm !== f.password}>
                  <MatchHint id="rp-match" password={f.password} confirm={f.confirm} />
                </PasswordField>
                {err && <p className={s.err} role="alert">{err}</p>}
                <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!ready || busy}>{busy ? 'Saving…' : 'Save and sign in'} <ArrowRight size={17} /></button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
