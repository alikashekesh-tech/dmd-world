import { useEffect, useState } from 'react';
import { account } from '../../lib/account.js';
import s from './AddressBook.module.css';
import a from '../../pages/Account.module.css';

const EMPTY = { label: '', firstName: '', lastName: '', phone: '', city: '', area: '', street: '', building: '', floor: '', notes: '', country: 'LB', isDefault: false };
const FIELDS = [
  ['label', 'Label', 'e.g. Home, Work', ''], ['phone', 'Phone for delivery', '+961 …', 'tel'],
  ['firstName', 'First name', '', 'given-name'], ['lastName', 'Last name', '', 'family-name'],
  ['city', 'City', 'Beirut', 'address-level2'], ['area', 'Area', 'Hamra', 'address-level3'],
  ['street', 'Street', '', 'address-line1', true], ['building', 'Building', '', 'address-line2'], ['floor', 'Floor', '', ''],
  ['notes', 'Directions for the driver', 'Landmark, entrance, best time to call…', '', true],
];

/** One address being added or edited. */
function AddressForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (e) => { setF((x) => ({ ...x, [e.target.name]: e.target.value })); setErr(''); };
  const ready = ['firstName', 'lastName', 'phone', 'city', 'street'].every((k) => String(f[k]).trim());
  const save = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try { await onSave(f); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <form className={s.form} onSubmit={save} noValidate>
      <div className={a.two}>
        {FIELDS.map(([k, label, ph, auto, wide]) => (
          <div key={k} className={`field ${wide ? a.wide : ''}`}>
            <label htmlFor={`ad-${k}`}>{label}</label>
            <input id={`ad-${k}`} name={k} className="input" value={f[k]} onChange={set} placeholder={ph} autoComplete={auto || 'off'} />
          </div>
        ))}
      </div>
      <label className={s.check}><input type="checkbox" checked={f.isDefault} onChange={(e) => setF((x) => ({ ...x, isDefault: e.target.checked }))} /> Use this address by default</label>
      {err && <p className={a.err} role="alert">{err}</p>}
      <div className={a.formActions}>
        <button type="submit" className="btn btn--primary" disabled={!ready || busy}>{busy ? 'Saving…' : 'Save address'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** The signed-in buyer's saved delivery addresses: add, edit, remove, and choose the default used at checkout. */
export default function AddressBook({ buyer }) {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | id
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const load = () => account.addresses.list().then(setList).catch((x) => { setErr(x.message); setList([]); });
  useEffect(() => { load(); }, []);

  const save = async (f) => {
    if (editing === 'new') await account.addresses.add(f); else await account.addresses.update(editing, f);
    setEditing(null);
    await load();
  };
  const act = async (id, fn) => {
    setBusy(id); setErr('');
    try { await fn(); await load(); } catch (x) { setErr(x.message); }
    setBusy(null);
  };

  if (list === null) return <p className={a.muted} role="status">Loading your addresses…</p>;
  return (
    <div className={s.book}>
      {err && <p className={a.err} role="alert">{err}</p>}
      {list.length === 0 && editing !== 'new' && <p className={a.muted}>No saved addresses yet. Add one and it’s filled in for you at checkout.</p>}
      <ul className={s.list}>
        {list.map((ad) => (
          <li key={ad.id} className={s.card}>
            {editing === ad.id ? <AddressForm initial={ad} onSave={save} onCancel={() => setEditing(null)} /> : (
              <>
                <div className={s.head}>
                  <b>{ad.label || 'Address'}</b>
                  {ad.isDefault && <span className={s.tag}>Default</span>}
                </div>
                <p>{ad.firstName} {ad.lastName} · {ad.phone}</p>
                <p className={s.line}>{ad.summary}</p>
                {ad.notes && <p className={s.note}>{ad.notes}</p>}
                <div className={s.actions}>
                  <button type="button" onClick={() => setEditing(ad.id)}>Edit</button>
                  {!ad.isDefault && <button type="button" disabled={busy === ad.id} onClick={() => act(ad.id, () => account.addresses.makeDefault(ad.id))}>Make default</button>}
                  <button type="button" className={s.remove} disabled={busy === ad.id} onClick={() => act(ad.id, () => account.addresses.remove(ad.id))} aria-label={`Remove ${ad.label || 'address'}: ${ad.summary}`}>Remove</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new'
        ? <div className={s.card}><AddressForm initial={{ ...EMPTY, firstName: buyer.firstName, lastName: buyer.lastName, phone: buyer.phone, isDefault: list.length === 0 }} onSave={save} onCancel={() => setEditing(null)} /></div>
        : list.length < 10 && <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>Add an address</button>}
    </div>
  );
}
