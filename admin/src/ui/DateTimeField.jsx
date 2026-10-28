import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from './icons.jsx';

/* A compact date-and-time picker for scheduling (banners). The owner picks in their own time zone (the browser's);
   `value` and `onChange` use ISO 8601 UTC strings ("2026-10-16T15:00:00.000Z"), or null for "not set", so the
   server always receives an unambiguous instant. Times snap to 15 minutes. */

const pad = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const atTime = (d, minutes) => { const x = new Date(d); x.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0); return x; };
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
const SLOTS = Array.from({ length: 96 }, (_, i) => i * 15);
const timeLabel = (m) => { const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** The browser's time zone, for labels: "Asia/Beirut (UTC+3)". */
export function zoneLabel(at = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const off = -at.getTimezoneOffset();
  const h = Math.floor(Math.abs(off) / 60); const m = Math.abs(off) % 60;
  return `${zone.replace(/_/g, ' ')} (UTC${off >= 0 ? '+' : '−'}${h}${m ? `:${pad(m)}` : ''})`;
}

/** "Fri 16 Oct, 6:00 PM" in the owner's time zone (the year only when it isn't this year). */
export function whenLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  return `${date}, ${timeLabel(minutesOf(d))}`;
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i));
}

/**
 * presets: [{ label, at: () => Date | null }]. min: ISO; earlier days are disabled.
 * emptyLabel: what "not set" means here ("Right away", "No end date").
 */
export default function DateTimeField({ label, value, onChange, presets = [], emptyLabel = 'Not set', min, error, hint, defaultMinutes = 9 * 60 }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : null;
  const [view, setView] = useState(() => { const d = selected || new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const wrap = useRef(null);
  const trigger = useRef(null);
  const pop = useRef(null);
  const [place, setPlace] = useState(null);
  const minDate = min ? new Date(min) : null;

  useEffect(() => {
    if (!open) return undefined;
    const d = value ? new Date(value) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open) { setPlace(null); return undefined; }
    const measure = () => {
      const r = trigger.current?.getBoundingClientRect(); const h = pop.current?.offsetHeight || 420; const w = pop.current?.offsetWidth || 296;
      if (!r) return;
      const below = window.innerHeight - r.bottom; const up = below < h + 12 && r.top > below;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPlace({ left, top: up ? Math.max(8, r.top - h - 6) : r.bottom + 6 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open]);

  const days = useMemo(() => monthGrid(view.y, view.m), [view]);
  const today = new Date();
  const set = (d) => onChange(d ? d.toISOString() : null);
  const pickDay = (d) => set(atTime(d, selected ? minutesOf(selected) : defaultMinutes));
  const pickTime = (m) => set(atTime(selected || today, Number(m)));
  const shift = (n) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const slots = selected && !SLOTS.includes(minutesOf(selected)) ? [...SLOTS, minutesOf(selected)].sort((a, b) => a - b) : SLOTS;

  return (
    <div className="field dtf" ref={wrap}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className={`dtf-control ${error ? 'invalid' : ''}`}>
        <button ref={trigger} id={id} type="button" className={`dtf-trigger ${selected ? '' : 'is-empty'}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="clock" size={15} />
          <span className="grow">{selected ? whenLabel(value) : emptyLabel}</span>
          <Icon name="down" size={14} className="muted" />
        </button>
        {selected && <button type="button" className="dtf-clear" aria-label={`Clear ${label || 'date'}`} onClick={() => set(null)}><Icon name="close" size={14} /></button>}
      </div>
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}

      {open && (
        <div ref={pop} className="dtf-pop" role="dialog" aria-label={label || 'Pick a date and time'} style={place ? { left: place.left, top: place.top } : { visibility: 'hidden' }}>
          {presets.length > 0 && (
            <div className="dtf-presets">
              {presets.map((p) => <button key={p.label} type="button" className="dtf-chip" onClick={() => { set(p.at()); setOpen(false); }}>{p.label}</button>)}
            </div>
          )}
          <div className="dtf-head">
            <button type="button" className="btn quiet sm icon" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="back" /></button>
            <b>{new Date(view.y, view.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
            <button type="button" className="btn quiet sm icon" aria-label="Next month" onClick={() => shift(1)}><Icon name="arrow" /></button>
          </div>
          <div className="dtf-grid" role="grid">
            {WEEK.map((w) => <span key={w} className="dtf-dow">{w}</span>)}
            {days.map((d) => {
              const off = d.getMonth() !== view.m;
              const before = minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
              return (
                <button key={d.toISOString()} type="button" disabled={before}
                  className={`dtf-day ${off ? 'off' : ''} ${sameDay(d, today) ? 'today' : ''} ${sameDay(d, selected) ? 'on' : ''}`}
                  aria-label={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={sameDay(d, selected)}
                  onClick={() => pickDay(d)}>{d.getDate()}</button>
              );
            })}
          </div>
          <div className="dtf-foot">
            <label className="dtf-time">
              <Icon name="clock" size={14} className="muted" />
              <span className="sr">Time</span>
              <select className="select" value={selected ? minutesOf(selected) : ''} onChange={(e) => pickTime(e.target.value)}>
                {!selected && <option value="" disabled>Time</option>}
                {slots.map((m) => <option key={m} value={m}>{timeLabel(m)}</option>)}
              </select>
            </label>
            <button type="button" className="btn primary sm" onClick={() => setOpen(false)}>Done</button>
          </div>
          <p className="dtf-zone">Times are in your time zone: {zoneLabel(selected || today)}</p>
        </div>
      )}
    </div>
  );
}
