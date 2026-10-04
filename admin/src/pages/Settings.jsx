import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { ago, num } from '../lib/format.js';
import { Button, Chip, Field, Icon, Notice, PageHeader, PasswordInput, PasswordRules, SkeletonRows, Toggle, passwordOk, useUi } from '../ui/kit.jsx';

const GROUPS = { general: ['Store details', 'Address and money, as WooCommerce uses them on invoices and emails.'], products: ['Stock & reviews', 'When stock alerts fire and how reviews work.'] };

function SettingInput({ s, value, onChange }) {
  if (s.type === 'checkbox') return <Toggle checked={value === 'yes'} onChange={(v) => onChange(v ? 'yes' : 'no')} label={s.label} />;
  if (s.options && (s.type === 'select' || s.type === 'single_select_country')) {
    return (
      <Field label={s.label} hint={s.description ? s.description.replace(/<[^>]+>/g, '') : null}>
        <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {Object.entries(s.options).map(([k, l]) => <option key={k} value={k}>{String(l).replace(/&[a-z]+;/g, '')}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={s.label} hint={s.description ? s.description.replace(/<[^>]+>/g, '') : null}>
      <input className={`input ${s.type === 'number' ? 'mono' : ''}`} type={s.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export default function Settings() {
  const { toast, fail } = useUi();
  const { data, error, setData } = useApi('/settings', { live: false });
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    if (!data) return;
    setVals(Object.fromEntries(Object.entries(data.store).flatMap(([g, list]) => list.map((s) => [`${g}:${s.id}`, s.value ?? '']))));
    setTarget(data.admin.dailyTarget ? String(data.admin.dailyTarget) : '');
  }, [data]);

  if (error) return <Notice tone="coral" icon="alert">{error.message}</Notice>;
  if (!data) return <SkeletonRows rows={8} />;
  const updates = Object.entries(data.store).flatMap(([g, list]) => list.filter((s) => String(vals[`${g}:${s.id}`] ?? '') !== String(s.value ?? '')).map((s) => ({ group: g, id: s.id, value: vals[`${g}:${s.id}`] })));
  const c = data.connection;

  const saveStore = async () => {
    setSaving(true);
    try {
      await api.put('/settings/store', { updates });
      setData((d) => ({ ...d, store: Object.fromEntries(Object.entries(d.store).map(([g, list]) => [g, list.map((s) => ({ ...s, value: vals[`${g}:${s.id}`] }))])) }));
      changed('settings');
      toast(`Saved ${updates.length} setting${updates.length === 1 ? '' : 's'} to WooCommerce`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const saveTarget = async (e) => {
    e.preventDefault();
    try { await api.put('/settings/admin', { dailyTarget: target ? Number(target) : null }); setData((d) => ({ ...d, admin: { dailyTarget: target ? Number(target) : null } })); changed('settings'); toast(target ? `Daily target set to $${num(Number(target))}` : 'Back to the automatic target'); } catch (x) { fail(x); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.again) return setPwErr('The two new passwords don’t match.');
    setPwBusy(true); setPwErr('');
    try { await api.post('/settings/password', { current: pw.current, next: pw.next, confirm: pw.again }); setPw({ current: '', next: '', again: '' }); toast('Password changed. Use the new one next time you sign in.'); } catch (x) { setPwErr(x.message); }
    setPwBusy(false);
  };
  const resync = async () => {
    setSyncing(true);
    try { const r = await api.post('/settings/resync'); setData((d) => ({ ...d, connection: { ...d.connection, ...r } })); changed('sync'); toast(`Re-read ${num(r.products)} products and ${num(r.orders)} orders from WooCommerce`); } catch (x) { fail(x); }
    setSyncing(false);
  };

  return (
    <>
      <PageHeader hud={<><span className="led" />Site</>} title="Settings" text="Store settings that are safe to change from here, plus how this back office behaves." />
      <div className="split">
        <div className="stack">
          {Object.entries(data.store).map(([g, list]) => (
            <section key={g} className="surface">
              <div className="surface-head"><div><h3>{GROUPS[g]?.[0] || g}</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{GROUPS[g]?.[1]}</p></div></div>
              <div className="surface-body stack">
                <div className="grid-2">
                  {list.filter((s) => s.type !== 'checkbox').map((s) => <SettingInput key={s.id} s={s} value={vals[`${g}:${s.id}`] ?? ''} onChange={(v) => setVals((x) => ({ ...x, [`${g}:${s.id}`]: v }))} />)}
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  {list.filter((s) => s.type === 'checkbox').map((s) => <SettingInput key={s.id} s={s} value={vals[`${g}:${s.id}`] ?? 'no'} onChange={(v) => setVals((x) => ({ ...x, [`${g}:${s.id}`]: v }))} />)}
                </div>
              </div>
            </section>
          ))}
          {updates.length > 0 && (
            <div className="savebar">
              <span className="dirty-dot" /><span className="t2">{updates.length} unsaved change{updates.length === 1 ? '' : 's'}</span><span className="grow" />
              <Button variant="quiet" onClick={() => setData((d) => ({ ...d }))}>Discard</Button>
              <Button variant="primary" icon="check" loading={saving} onClick={saveStore}>Save to WooCommerce</Button>
            </div>
          )}
          <Notice icon="info">Payments, shipping zones, taxes and emails stay in WooCommerce’s own settings. They involve providers and legal text that are safer to change there.</Notice>
        </div>

        <aside className="stack sticky-col">
          <section className="surface">
            <div className="surface-head"><h3>Daily revenue target</h3></div>
            <form className="surface-body stack" onSubmit={saveTarget}>
              <Field label="Target per day" hint="Drives the progress bar on the dashboard. Leave empty for automatic (last 30 days’ daily average + 10%).">
                <span className="input-affix"><span>$</span><input className="input mono" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="automatic" /></span>
              </Field>
              <Button type="submit" icon="check" disabled={(target || '') === String(data.admin.dailyTarget || '')}>Save target</Button>
            </form>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Owner password</h3><Icon name="lock" size={16} className="muted" /></div>
            <form className="surface-body stack" onSubmit={changePw} noValidate>
              <Field label="Current password"><PasswordInput value={pw.current} onChange={(v) => { setPw({ ...pw, current: v }); setPwErr(''); }} autoComplete="current-password" /></Field>
              <Field label="New password"><PasswordInput value={pw.next} onChange={(v) => { setPw({ ...pw, next: v }); setPwErr(''); }} autoComplete="new-password" describedBy="owner-pw-rules" invalid={pw.next && !passwordOk(pw.next)} /></Field>
              <PasswordRules id="owner-pw-rules" password={pw.next} />
              <Field label="Confirm new password"><PasswordInput value={pw.again} onChange={(v) => { setPw({ ...pw, again: v }); setPwErr(''); }} autoComplete="new-password" invalid={pw.again && pw.again !== pw.next} describedBy="owner-pw-match" /></Field>
              <span id="owner-pw-match" aria-live="polite">
                {pw.again && (pw.again === pw.next
                  ? <span className="pw-match ok"><Icon name="check" size={14} />Passwords match</span>
                  : <span className="pw-match no"><Icon name="close" size={14} />Doesn’t match the new password yet</span>)}
              </span>
              {pw.next && pw.current && pw.next === pw.current && <span className="pw-match no"><Icon name="alert" size={14} />Choose a password different from the current one</span>}
              {pwErr && <Notice tone="coral" icon="alert">{pwErr}</Notice>}
              <Button type="submit" icon="lock" loading={pwBusy} disabled={!pw.current || !passwordOk(pw.next) || pw.next !== pw.again || pw.next === pw.current}>Change password</Button>
            </form>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Store connection</h3><Chip tone={c.env === 'live' ? 'coral' : c.env === 'emulator' ? 'amber' : 'green'} led>{c.env}{c.readOnly ? ' · read-only' : ''}</Chip></div>
            <div className="surface-body stack" style={{ gap: 8, fontSize: 13 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Store</span><span className="mono clamp1" style={{ maxWidth: 200 }}>{c.url.replace(/^https?:\/\//, '')}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Products mirrored</span><span className="mono">{num(c.products)} · {c.productsSyncedAt ? ago(new Date(c.productsSyncedAt).toISOString()) : 'never'}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Orders mirrored</span><span className="mono">{num(c.orders)} · {c.ordersSyncedAt ? ago(new Date(c.ordersSyncedAt).toISOString()) : 'never'}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Image uploads</span>{c.media ? <Chip tone="green">On</Chip> : <Chip tone="muted">Off · needs WP app password</Chip>}</div>
              <Button icon="refresh" loading={syncing} onClick={resync}>Re-read everything now</Button>
              <span className="muted" style={{ fontSize: 12 }}>The admin keeps a fast copy of products and the last 190 days of orders and refreshes it every minute. Use this if you changed things directly in WordPress.</span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
