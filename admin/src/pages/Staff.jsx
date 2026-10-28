import { useState } from 'react';
import { api, changed } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { ago } from '../lib/format.js';
import { Avatar, Button, Chip, Drawer, Empty, Field, Notice, PageHeader, PasswordInput, PasswordRules, SkeletonRows, passwordOk, useUi } from '../ui/kit.jsx';

/* Who can sign in to this admin (owner only). Staff run the shop: products, stock, orders, customers, messages, reviews,
   offers and the homepage. Only the owner changes the store settings and manages staff. The owner picks each first
   password and passes it on; staff change it in Settings. A new password or removal signs that person out at once. */
export default function Staff({ session }) {
  const { toast, fail, confirm } = useUi();
  const { data, error, loading, reload } = useApi('/staff', { live: false });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);

  if (session?.owner?.role !== 'owner') return <Notice tone="coral" icon="lock">Only the store owner can manage staff.</Notice>;

  const people = data?.data || [];
  const remove = async (p) => {
    if (!(await confirm({ title: `Remove ${p.name}?`, text: 'They are signed out at once and can no longer open the admin. What they already did (orders, notes, changes) stays in the history.', confirmLabel: 'Remove', danger: true }))) return;
    try { await api.del(`/staff/${p.id}`); changed('staff'); reload(true); toast(`Removed ${p.name}`); } catch (e) { fail(e); }
  };

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Site</>} title="Staff" text="People who can sign in to this admin. Staff can run the shop; only you can change the store settings and manage staff."
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add staff</Button>} />
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows rows={3} /> : people.length < 2 ? (
          <Empty icon="users" title="Only you so far" action={<Button icon="plus" onClick={() => setAdding(true)}>Add staff</Button>}>Add the people who help you run the shop. Each gets their own sign-in.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td><div className="cell-main"><Avatar name={p.name} /><div style={{ minWidth: 0 }}><b>{p.name}{p.id === session.owner.id && <span className="muted"> (you)</span>}</b><small>{p.email}</small></div></div></td>
                    <td data-label="Role">{p.role === 'owner' ? <Chip tone="blue">Owner</Chip> : <Chip>Staff</Chip>}</td>
                    <td data-label="Last sign-in" className="t2">{p.last_login_at ? ago(p.last_login_at) : 'Not yet'}</td>
                    <td className="right">
                      {p.role === 'staff' && (
                        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <Button size="sm" icon="lock" onClick={() => setResetting(p)}>New password</Button>
                          <Button size="sm" variant="quiet" icon="trash" onClick={() => remove(p)} aria-label={`Remove ${p.name}`} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <AddStaff onClose={() => setAdding(false)} onAdded={(p) => { setAdding(false); changed('staff'); reload(true); toast(`${p.name} can now sign in with ${p.email}`); }} />}
      {resetting && <NewPassword person={resetting} onClose={() => setResetting(null)} onDone={() => { toast(`New password set for ${resetting.name}. They were signed out everywhere.`); setResetting(null); }} />}
    </>
  );
}

function AddStaff({ onClose, onAdded }) {
  const { fail } = useUi();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const ok = f.name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) && passwordOk(f.password);
  const save = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErrors({});
    try { onAdded((await api.post('/staff', { name: f.name.trim(), email: f.email.trim(), password: f.password })).data); } catch (x) { if (x.fields) setErrors(x.fields); else fail(x); }
    setBusy(false);
  };
  return (
    <Drawer title="Add staff" hud="New sign-in" onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><span className="grow" /><Button variant="primary" icon="check" loading={busy} disabled={!ok} onClick={save}>Add staff</Button></>}>
      <form className="stack" onSubmit={save}>
        <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} autoFocus maxLength={80} /></Field>
        <Field label="Email" hint="They sign in with this." error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="off" maxLength={254} /></Field>
        <Field label="First password" hint="Give it to them in person; they can change it in Settings." error={errors.password}>
          <PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" describedBy="staff-pw-rules" invalid={f.password && !passwordOk(f.password)} />
        </Field>
        <PasswordRules password={f.password} id="staff-pw-rules" />
        <Notice icon="info">Staff can manage products, stock, orders, customers, messages, reviews, offers and the homepage. They can’t change the store settings or manage staff.</Notice>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

function NewPassword({ person, onClose, onDone }) {
  const { fail } = useUi();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!passwordOk(password) || busy) return;
    setBusy(true);
    try { await api.put(`/staff/${person.id}/password`, { password }); onDone(); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <Drawer title={`New password for ${person.name}`} hud={person.email} onClose={onClose}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><span className="grow" /><Button variant="primary" icon="check" loading={busy} disabled={!passwordOk(password)} onClick={save}>Set password</Button></>}>
      <form className="stack" onSubmit={save}>
        <Field label="New password" hint="They are signed out everywhere and sign in again with this one.">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" describedBy="reset-pw-rules" invalid={password && !passwordOk(password)} autoFocus />
        </Field>
        <PasswordRules password={password} id="reset-pw-rules" />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
