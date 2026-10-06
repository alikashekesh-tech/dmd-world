import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { num } from '../lib/format.js';
import { Button, Field, Icon, Notice, PageHeader, PasswordInput, PasswordRules, SkeletonRows, Toggle, passwordOk, useUi } from '../ui/kit.jsx';

const KEYS = ['store_name', 'contact_phone', 'contact_email', 'low_stock_threshold', 'reviews_enabled', 'reviews_require_purchase', 'coupons_enabled', 'payment_methods', 'delivery_methods', 'bank_transfer_note'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function Settings({ session }) {
  const { toast, fail } = useUi();
  const { data, error, setData } = useApi('/settings', { live: false });
  const [vals, setVals] = useState(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const stored = data?.data;
  useEffect(() => {
    if (!stored) return;
    setVals(Object.fromEntries(KEYS.map((k) => [k, stored[k]])));
    setTarget(stored.daily_revenue_target != null ? String(stored.daily_revenue_target) : '');
  }, [stored]);

  if (error) return <Notice tone="coral" icon="alert">{error.message}</Notice>;
  if (!stored || !vals) return <SkeletonRows rows={8} />;
  const changes = Object.fromEntries(KEYS.filter((k) => !same(vals[k], stored[k])).map((k) => [k, vals[k]]));
  const n = Object.keys(changes).length;
  const set = (k) => (v) => setVals((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const toggleIn = (k, id, on) => setVals((x) => ({ ...x, [k]: on ? [...new Set([...x[k], id])] : x[k].filter((y) => y !== id) }));

  const saveStore = async () => {
    setSaving(true);
    try {
      const body = { ...changes };
      if ('low_stock_threshold' in body) body.low_stock_threshold = Number(body.low_stock_threshold);
      if ('bank_transfer_note' in body) body.bank_transfer_note = body.bank_transfer_note || null;
      const r = await api.put('/settings', body);
      setData(r);
      changed('settings');
      toast(`Saved ${n} setting${n === 1 ? '' : 's'}`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const saveTarget = async (e) => {
    e.preventDefault();
    try { const r = await api.put('/settings', { daily_revenue_target: target ? Number(target) : null }); setData(r); changed('settings'); toast(target ? `Daily target set to $${num(Number(target))}` : 'Daily target removed'); } catch (x) { fail(x); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.again) return setPwErr('The two new passwords don’t match.');
    setPwBusy(true); setPwErr('');
    try { await api.put('/auth/password', { current_password: pw.current, password: pw.next, password_confirmation: pw.again }); setPw({ current: '', next: '', again: '' }); toast('Password changed. Other devices were signed out.'); } catch (x) { setPwErr(x.message); }
    setPwBusy(false);
  };
  const methods = (key, all) => Object.entries(all).map(([id, label]) => (
    <Toggle key={id} label={label} checked={vals[key].includes(id)} disabled={vals[key].length === 1 && vals[key].includes(id)} onChange={(on) => toggleIn(key, id, on)} />
  ));

  return (
    <>
      <PageHeader hud={<><span className="led" />Site</>} title="Settings" text="How the store works: contact details, stock alerts, reviews, coupons and checkout options." />
      <div className="split">
        <div className="stack">
          <section className="surface">
            <div className="surface-head"><div><h3>Store details</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Shown in the shop’s header, footer and “Ask first”.</p></div></div>
            <div className="surface-body grid-2">
              <Field label="Store name"><input className="input" value={vals.store_name} onChange={set('store_name')} /></Field>
              <Field label="Phone"><input className="input" type="tel" value={vals.contact_phone} onChange={set('contact_phone')} /></Field>
              <Field label="Email"><input className="input" type="email" value={vals.contact_email} onChange={set('contact_email')} /></Field>
            </div>
          </section>
          <section className="surface">
            <div className="surface-head"><div><h3>Stock & reviews</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>When stock alerts fire and how reviews work.</p></div></div>
            <div className="surface-body stack">
              <Field label="Low-stock alert at" hint="Products with this many or fewer show as running low (a product can set its own)."><input className="input mono" type="number" min="0" style={{ maxWidth: 140 }} value={vals.low_stock_threshold} onChange={set('low_stock_threshold')} /></Field>
              <Toggle label="Buyers can write reviews" checked={vals.reviews_enabled} onChange={set('reviews_enabled')} />
              <Toggle label="Only buyers who bought the product can review it" checked={vals.reviews_require_purchase} onChange={set('reviews_require_purchase')} disabled={!vals.reviews_enabled} />
            </div>
          </section>
          <section className="surface">
            <div className="surface-head"><div><h3>Checkout</h3><p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>What buyers can choose when they order. At least one of each stays on.</p></div></div>
            <div className="surface-body stack">
              <span className="label">Payment</span>
              {methods('payment_methods', data.meta.payment_methods)}
              {vals.payment_methods.includes('bank_transfer') && <Field label="Bank transfer note" hint="Shown under “Direct bank transfer” at checkout."><input className="input" maxLength={300} value={vals.bank_transfer_note || ''} onChange={set('bank_transfer_note')} /></Field>}
              <span className="label" style={{ marginTop: 6 }}>Delivery</span>
              {methods('delivery_methods', data.meta.delivery_methods)}
              <Toggle label="Discount codes can be used" checked={vals.coupons_enabled} onChange={set('coupons_enabled')} />
            </div>
          </section>
          {n > 0 && (
            <div className="savebar">
              <span className="dirty-dot" /><span className="t2">{n} unsaved change{n === 1 ? '' : 's'}</span><span className="grow" />
              <Button variant="quiet" onClick={() => setVals(Object.fromEntries(KEYS.map((k) => [k, stored[k]])))}>Discard</Button>
              <Button variant="primary" icon="check" loading={saving} onClick={saveStore}>Save settings</Button>
            </div>
          )}
        </div>

        <aside className="stack sticky-col">
          <section className="surface">
            <div className="surface-head"><h3>Daily revenue target</h3></div>
            <form className="surface-body stack" onSubmit={saveTarget}>
              <Field label="Target per day" hint="Drives the progress bar on the dashboard. Leave empty for no target.">
                <span className="input-affix"><span>$</span><input className="input mono" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="none" /></span>
              </Field>
              <Button type="submit" icon="check" disabled={(target || '') === (stored.daily_revenue_target != null ? String(stored.daily_revenue_target) : '')}>Save target</Button>
            </form>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Owner password</h3><Icon name="lock" size={16} className="muted" /></div>
            <form className="surface-body stack" onSubmit={changePw} noValidate>
              <p className="muted" style={{ fontSize: 12.5 }}>Signed in as {session.owner?.email}.</p>
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
        </aside>
      </div>
    </>
  );
}
