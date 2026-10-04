import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Icon, Notice, PasswordInput } from '../ui/kit.jsx';

/* The owner's door: one password, no accounts. */
export function Login({ store, onIn }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.post('/login', { password: pw }); onIn(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span className="brand-logo"><img src="https://dmdworld.store/wp-content/uploads/2022/11/LOGO-2048x803.png" alt="DMD World" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.src = '/images/dmd-logo.png'; }} /></span>
          <span className="press">PRESS START</span>
        </span>
        <div>
          <span className="hud"><span className="led green pulse" />Owner access</span>
          <h1 style={{ marginTop: 10 }}>DMD World Command</h1>
          <p className="t2" style={{ marginTop: 6 }}>Run the store: orders, stock, offers, buyers and the homepage.</p>
        </div>
        {store?.env === 'emulator' && <Notice tone="amber" icon="alert">Connected to the <b>local test emulator</b>, not your store.</Notice>}
        {store?.env === 'live' && !store.readOnly && <Notice tone="coral" icon="alert">Connected to the <b>live store</b>. Changes reach real customers.</Notice>}
        <Field label="Password" error={err}>
          <PasswordInput value={pw} onChange={setPw} autoFocus autoComplete="current-password" invalid={!!err} />
        </Field>
        <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!pw} iconRight="arrow">Sign in</Button>
      </form>
    </div>
  );
}

export function Setup({ missing }) {
  return (
    <div className="login">
      <div className="login-card" style={{ width: 'min(560px, 100%)' }}>
        <span className="hud"><span className="led amber pulse" />Setup needed</span>
        <h1>Connect the admin to your store</h1>
        <p className="t2">The admin server is running but isn’t configured yet. Missing in <span className="mono">server/.env</span>: <b className="mono">{missing.join(', ')}</b></p>
        <ol className="stack t2" style={{ paddingLeft: 18, listStyle: 'decimal', gap: 8 }}>
          <li>In WordPress (staging first): <b>WooCommerce → Settings → Advanced → REST API → Add key</b>, permission <b>Read/Write</b>.</li>
          <li>Put the address, key and secret in <span className="mono">server/.env</span> as <span className="mono">WOO_URL</span>, <span className="mono">WOO_KEY</span>, <span className="mono">WOO_SECRET</span>, and set <span className="mono">WOO_ENV=staging</span>.</li>
          <li>Set your owner password (8+ characters with upper and lower case, a number and a special character): <span className="mono">npm --prefix server run setup -- --password "…"</span></li>
          <li>Restart the server: <span className="mono">npm --prefix server start</span></li>
        </ol>
        <Notice icon="lock">Keys stay in <span className="mono">server/.env</span> on the server. The browser never sees them.</Notice>
      </div>
    </div>
  );
}

export function Offline({ error, retry }) {
  return (
    <div className="login">
      <div className="login-card">
        <span className="hud"><span className="led coral" />Server offline</span>
        <h1>Can’t reach the admin server</h1>
        <p className="t2">{error}</p>
        <p className="t2">Start it with <span className="mono">npm --prefix server start</span>, then try again.</p>
        <Button icon="refresh" onClick={retry}>Try again</Button>
      </div>
    </div>
  );
}

export const Spinner = () => <div className="login"><span className="hud"><span className="led blue pulse" />Connecting<Icon name="refresh" size={12} /></span></div>;
