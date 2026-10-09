import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { STATUS, NEXT_STATUS, initials } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { checkPassword } from '../../../shared/passwordPolicy.js';

export { Icon };

export function Button({ variant, size, icon, iconRight, loading, children, className = '', ...rest }) {
  return (
    <button type="button" className={`btn ${variant || ''} ${size || ''} ${!children ? 'icon' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spin" /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </button>
  );
}

/* Ties the label to the field's control: the child itself, or the input inside an .input-affix / .row wrapper. */
const CONTROLS = new Set(['input', 'select', 'textarea']);
function withId(child, id) {
  if (!isValidElement(child)) return [child, false];
  if (CONTROLS.has(child.type) || child.type?.fieldControl) return [cloneElement(child, { id: child.props.id || id }), true];
  if (typeof child.type === 'string' && child.props.children) {
    let done = false;
    const kids = Children.map(child.props.children, (k) => { if (done) return k; const [n, ok] = withId(k, id); done = ok; return n; });
    return done ? [cloneElement(child, {}, kids), true] : [child, false];
  }
  return [child, false];
}
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  const [control, linked] = withId(Children.count(children) === 1 ? Children.only(children) : null, id);
  return (
    <div className={`field ${className}`}>
      {label && (linked ? <label htmlFor={id}>{label}</label> : <span className="label" role="presentation">{label}</span>)}
      {linked ? control : children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Check({ on, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!on} aria-label={label} className={`check ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      {on && <Icon name="check" />}
    </button>
  );
}

export function Chip({ tone, led, children, title }) {
  return <span className={`chip ${tone || ''}`} title={title}>{led && <span className="led" />}{children}</span>;
}

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, tone: 'muted' };
  return <Chip tone={s.tone} led title={s.hint}>{s.label}</Chip>;
}

const TONE_COLOR = { amber: 'var(--amber)', blue: 'var(--blue)', violet: 'var(--violet)', green: 'var(--green)', coral: 'var(--coral)', muted: 'var(--muted)' };
const TONE_BG = Object.fromEntries(Object.entries({ ...TONE_COLOR, muted: 'var(--shade)' }).map(([t, c]) => [t, `color-mix(in srgb, ${c} ${t === 'muted' ? 7 : 11}%, transparent)`]));
/** Order status you can change in place. */
export function StatusSelect({ status, onChange, busy }) {
  const s = STATUS[status] || STATUS.pending;
  const options = [status, ...(NEXT_STATUS[status] || [])];
  return (
    <span className="status-select" style={{ color: TONE_COLOR[s.tone] }} onClick={(e) => e.stopPropagation()}>
      <select aria-label="Order status" value={status} disabled={busy} onChange={(e) => onChange(e.target.value)} style={{ color: TONE_COLOR[s.tone], background: TONE_BG[s.tone] }}>
        {options.map((k) => <option key={k} value={k}>{STATUS[k]?.label || k}</option>)}
      </select>
    </span>
  );
}

export function Thumb({ src, size = '', alt = '' }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={`thumb none ${size}`}><Icon name="image" /></span>;
  return <span className={`thumb ${size}`}><img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /></span>;
}

export function Avatar({ name, size = '' }) {
  const h = [...(name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return <span className={`avatar ${size}`} style={{ '--h': h }} aria-hidden="true">{initials(name)}</span>;
}

/** `className="two-up"`: on phones, four tabs sit as two even rows (2×2) instead of wrapping three-and-one. */
export function Tabs({ items, value, onChange, label, className }) {
  return (
    <div className={className ? `tabs ${className}` : 'tabs'} role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'on' : ''}`} onClick={() => onChange(t.value)}>
          {t.led && <span className={`led ${t.led}`} />}{t.label}{t.count != null && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', autoFocus }) {
  return (
    <label className="searchbox">
      <Icon name="search" />
      <span className="sr">Search</span>
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
    </label>
  );
}

export function Pager({ page, pages, total, onPage, noun = 'items' }) {
  return (
    <div className="pager">
      <span>{total != null ? `${total.toLocaleString()} ${noun}` : ''}</span>
      <span className="row">
        <Button size="sm" variant="quiet" icon="back" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span>{page} / {pages || 1}</span>
        <Button size="sm" variant="quiet" icon="arrow" disabled={page >= (pages || 1)} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </span>
    </div>
  );
}

export function Empty({ icon = 'box', title, children, action }) {
  return <div className="empty"><Icon name={icon} /><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function Skeleton({ h = 14, w = '100%', r }) { return <span className="skeleton" style={{ display: 'block', height: h, width: w, borderRadius: r }} />; }
export function SkeletonRows({ rows = 6 }) {
  return <div className="stack" style={{ padding: 16 }}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={36} />)}</div>;
}

export function Notice({ tone, icon = 'info', children }) {
  return <div className={`notice ${tone || ''}`}><Icon name={icon} /><div>{children}</div></div>;
}

export function PageHeader({ crumbs, hud, title, text, actions }) {
  return (
    <div className="ph">
      <div>
        {crumbs ? <div className="crumbs">{crumbs.map((c, i) => <span key={i} className="row" style={{ gap: 8 }}>{i > 0 && <span>/</span>}{c.to ? <a href={c.to}>{c.label}</a> : c.label}</span>)}</div> : hud && <span className="hud">{hud}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}

/* Stock health as a 10-segment bar: green fine, amber low, coral out. */
export function Hp({ qty, level, scale = 30 }) {
  const on = level === 'out' ? 10 : level === 'untracked' ? 0 : Math.max(1, Math.min(10, Math.ceil(((qty || 0) / scale) * 10)));
  return (
    <span className="hp" title={level === 'untracked' ? 'Stock not tracked' : `${qty} in stock`}>
      <span className={`hp-bar ${level}`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</span>
      <b style={{ color: level === 'out' ? 'var(--coral)' : level === 'low' ? 'var(--amber)' : level === 'untracked' ? 'var(--muted)' : 'var(--text)' }}>{level === 'untracked' ? '—' : qty ?? 0}</b>
    </span>
  );
}

/* ── overlays ────────────────────────────────────────────────────────── */
export function Drawer({ title, hud, onClose, children, footer, wide }) {
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div className="grow">{hud && <span className="hud">{hud}</span>}<h2>{title}</h2></div>
          <Button variant="quiet" icon="close" onClick={onClose} aria-label="Close" />
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

/** Toasts (with an optional undo) and confirmation dialogs, available everywhere. */
export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const toast = useCallback((text, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms || (opts.undo ? 10000 : 4000));
  }, []);
  const fail = useCallback((e) => toast(e?.message || String(e), { error: true, ms: 6000 }), [toast]);
  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);
  const value = useMemo(() => ({ toast, fail, confirm }), [toast, fail, confirm]);
  return (
    <UiCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`} role={t.error ? 'alert' : 'status'}>
            <span className={`led ${t.error ? 'coral' : 'green'}`} />
            <span className="grow">{t.text}</span>
            {t.undo && <Button size="sm" icon="undo" onClick={() => { setToasts((x) => x.filter((y) => y.id !== t.id)); t.undo(); }}>Undo</Button>}
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog {...dialog} close={(v) => { dialog.resolve(v); setDialog(null); }} />}
    </UiCtx.Provider>
  );
}

/** `option` ({ label, checked }): one extra choice; the dialog then answers { option } instead of true (still truthy). */
function ConfirmDialog({ title, text, confirmLabel = 'Confirm', danger, typeToConfirm, option, close }) {
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState(!!option?.checked);
  const ok = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const on = (e) => { if (e.key === 'Escape') close(false); }; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, [close]);
  return (
    <>
      <div className="scrim modal-scrim" onClick={() => close(false)} />
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="modal-body">
          <h2>{title}</h2>
          {text && <p>{text}</p>}
          {option && <Toggle label={option.label} checked={chosen} onChange={setChosen} />}
          {typeToConfirm && (
            <Field label={`Type “${typeToConfirm}” to confirm`}>
              <input ref={ref} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ok) close(true); }} />
            </Field>
          )}
        </div>
        <div className="modal-foot">
          {/* Destructive dialogs start on Cancel, so a stray Enter never deletes anything. */}
          <Button ref={!typeToConfirm && danger ? ref : undefined} variant="quiet" onClick={() => close(false)}>Cancel</Button>
          <Button ref={!typeToConfirm && !danger ? ref : undefined} variant={danger ? 'solid-danger' : 'primary'} disabled={!ok} onClick={() => close(option ? { option: chosen } : true)}>{confirmLabel}</Button>
        </div>
      </div>
    </>
  );
}

/* ── pickers ─────────────────────────────────────────────────────────── */
/** Search the catalog and pick products (ids). */
export function ProductPicker({ value = [], onChange, placeholder = 'Search products to add…' }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [results, setResults] = useState([]);
  const [chosen, setChosen] = useState({});
  useEffect(() => {
    let live = true;
    if (dq.trim().length < 2) { setResults([]); return undefined; }
    api.get(`/products?q=${encodeURIComponent(dq)}&per_page=8`).then((r) => { if (live) setResults(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  useEffect(() => {
    const missing = value.filter((id) => !chosen[id]);
    if (!missing.length) return;
    Promise.all(missing.slice(0, 40).map((id) => api.get(`/products/${id}`).then(({ data: p }) => [id, { id: p.id, name: p.name, image: p.image, price: p.price }]).catch(() => [id, { id, name: `#${id}` }])))
      .then((pairs) => setChosen((c) => ({ ...c, ...Object.fromEntries(pairs) })));
  }, [value]); // eslint-disable-line
  const add = (p) => { if (!value.includes(p.id)) { setChosen((c) => ({ ...c, [p.id]: p })); onChange([...value, p.id]); } setQ(''); };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <SearchBox value={q} onChange={setQ} placeholder={placeholder} />
        {results.length > 0 && (
          <div className="menu" style={{ left: 0, right: 0, maxHeight: 280, overflowY: 'auto' }}>
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)}>
                <Thumb src={p.image} size="sm" /><span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {value.includes(p.id) ? <Icon name="check" /> : <span className="mono muted">${p.price}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <ul className="surface ledger" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {value.map((id) => (
            <li key={id} className="row" style={{ padding: '8px 10px' }}>
              <Thumb src={chosen[id]?.image} size="sm" />
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen[id]?.name || `#${id}`}</span>
              <Button size="sm" variant="quiet" icon="close" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== id))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Category tree with checkboxes (or radio when `single`). */
export function CategoryPicker({ categories, value = [], onChange, single, exclude = [], maxHeight = 300 }) {
  const [q, setQ] = useState('');
  const kids = useMemo(() => { const m = {}; for (const c of categories) (m[c.parent] ||= []).push(c); return m; }, [categories]);
  const s = q.trim().toLowerCase();
  const rows = [];
  const label = (c) => c.label || c.name;
  const walk = (parent, depth) => { for (const c of (kids[parent] || []).sort((a, b) => label(a).localeCompare(label(b)))) { if (exclude.includes(c.id)) continue; if (!s || label(c).toLowerCase().includes(s)) rows.push({ c, depth: s ? 0 : depth }); walk(c.id, depth + 1); } };
  walk(0, 0);
  const toggle = (id) => onChange(single ? (value[0] === id ? [] : [id]) : value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <SearchBox value={q} onChange={setQ} placeholder="Filter categories" />
      <ul className="surface" style={{ maxHeight, overflowY: 'auto', padding: 6 }}>
        {rows.map(({ c, depth }) => (
          <li key={c.id}>
            <label className="row" style={{ padding: '6px 8px', paddingLeft: 8 + depth * 18, borderRadius: 8, cursor: 'pointer' }}>
              <Check on={value.includes(c.id)} onChange={() => toggle(c.id)} label={label(c)} />
              <span className="grow" style={{ fontSize: 13.5 }}>{label(c)}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{c.count}</span>
            </label>
          </li>
        ))}
        {!rows.length && <li className="muted" style={{ padding: 10 }}>No categories match.</li>}
      </ul>
    </div>
  );
}

/* ── passwords ───────────────────────────────────────────────────────── */
/** Password input with a show/hide toggle. */
export function PasswordInput({ id, value, onChange, autoComplete = 'current-password', invalid, describedBy, autoFocus }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-wrap">
      <input id={id} className="input" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={describedBy} autoFocus={autoFocus} />
      <button type="button" className="pw-eye" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </span>
  );
}
PasswordInput.fieldControl = true;

/** Live checklist of the shared password rules: neutral until typing starts, then met / not met. */
export function PasswordRules({ password, id }) {
  const typed = password.length > 0;
  const rules = checkPassword(password);
  const met = rules.filter((r) => r.ok).length;
  return (
    <div className="pw-rules" id={id}>
      <span className="sr" aria-live="polite">{typed ? (met === rules.length ? 'All password requirements met.' : `${met} of ${rules.length} password requirements met.`) : ''}</span>
      <ul aria-label="Password requirements">
        {rules.map((r) => (
          <li key={r.id} className={!typed ? '' : r.ok ? 'ok' : 'no'}>
            <span className="pw-mark" aria-hidden="true">{typed ? <Icon name={r.ok ? 'check' : 'close'} size={11} /> : null}</span>
            {r.label}<span className="sr">{typed ? (r.ok ? ': met' : ': not met yet') : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export const passwordOk = (p) => checkPassword(p).every((r) => r.ok);
