import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Icon, Notice, PasswordInput } from '../ui/kit.jsx';

/* The owner's door: the one owner account (email and password), kept by the Laravel API. */
export function Login({ onIn }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.post('/auth/login', { email: email.trim(), password: pw }); onIn(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span className="brand-logo"><img src="/images/dmd-logo.png" alt="DMD World" /></span>
          <span className="press">PRESS START</span>
        </span>
        <div>
          <span className="hud"><span className="led green pulse" />Owner access</span>
          <h1 style={{ marginTop: 10 }}>DMD World Command</h1>
          <p className="t2" style={{ marginTop: 6 }}>Run the store: orders, stock, offers, buyers and the homepage.</p>
        </div>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="Password" error={err}>
          <PasswordInput value={pw} onChange={setPw} autoComplete="current-password" invalid={!!err} />
        </Field>
        <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!email.trim() || !pw} iconRight="arrow">Sign in</Button>
        <p className="muted" style={{ fontSize: 12 }}>First time? The owner account is created on the server with <span className="mono">php artisan dmd:owner</span>.</p>
      </form>
    </div>
  );
}

export function Offline({ error, retry }) {
  return (
    <div className="login">
      <div className="login-card">
        <span className="hud"><span className="led coral" />Server offline</span>
        <h1>Can’t reach the store’s server</h1>
        <p className="t2">{error}</p>
        <Notice icon="info">In development, start the Laravel API (<span className="mono">npm run api:serve</span>) next to the dev server.</Notice>
        <Button icon="refresh" onClick={retry}>Try again</Button>
      </div>
    </div>
  );
}

export const Spinner = () => <div className="login"><span className="hud"><span className="led blue pulse" />Connecting<Icon name="refresh" size={12} /></span></div>;
