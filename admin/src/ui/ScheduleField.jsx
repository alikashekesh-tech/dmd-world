import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { TZDate } from '@date-fns/tz';
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/react-dom';
import 'react-day-picker/style.css';
import '../styles/schedule.css';
import Icon from './icons.jsx';
import { formatShort, formatWhen, instantOf, offsetLabel, partsOf, storeZone, zoneCity } from '../lib/zone.js';

/*
 * A date-and-time field for schedules (offers). The calendar is react-day-picker (keyboard navigation, month and year
 * menus, disabled days); times are in the store's time zone (lib/zone.js) and `value` / `onChange` are UTC ISO
 * strings, or null for "not set" (start: immediately; end: no expiration). Clicking anywhere on the field opens it;
 * Escape, Done or a click outside closes it.
 *
 * kind: 'start' | 'end'. after: the earliest instant allowed (an end's start), before: the latest (a start's end).
 */

const pad = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a && b && a.y === b.y && a.m === b.m && a.d === b.d;

function TimeInput({ value, max, label, onChange, onEnter }) {
  const [text, setText] = useState(pad(value));
  useEffect(() => setText(pad(value)), [value]);
  const commit = (raw) => {
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) { setText(pad(value)); return; }
    const v = Math.min(max, Math.max(0, n));
    setText(pad(v)); if (v !== value) onChange(v);
  };
  const step = (by) => onChange((value + by + max + 1) % (max + 1));
  return (
    <input className="sp-num" inputMode="numeric" aria-label={label} role="spinbutton" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
      value={text} maxLength={2} onFocus={(e) => e.target.select()}
      onChange={(e) => { const t = e.target.value.replace(/\D/g, ''); setText(t); if (t.length === 2) commit(t); }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); onEnter?.(); }
      }} />
  );
}

export default function ScheduleField({ label, value, onChange, kind = 'start', after, before, error, hint, emptyText }) {
  const zone = storeZone();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(null);
  const wrap = useRef(null);
  const trigger = useRef(null);
  const sel = value ? partsOf(value, zone) : null;
  const today = partsOf(new Date().toISOString(), zone);
  const [month, setMonth] = useState(() => new TZDate(sel?.y ?? today.y, sel?.m ?? today.m, 1, zone));
  const empty = emptyText || (kind === 'start' ? 'Starts immediately' : 'No expiration');

  const { refs, floatingStyles } = useFloating({
    open, strategy: 'fixed', placement: 'bottom-start', whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(260, availableHeight)}px`; } })],
  });

  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const s = sel || today;
    setMonth(new TZDate(s.y, s.m, 1, zone));
    const away = (e) => { if (!wrap.current?.contains(e.target) && !refs.floating.current?.contains(e.target)) close(false); };
    // Capture phase, and stopped: Escape closes the calendar, not the drawer around it.
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sets the value from wall-clock parts in the store zone (null: not set). */
  const put = (p) => {
    if (!p) { setNote(null); onChange(null); return; }
    const r = instantOf(p, zone);
    setNote(r.shifted ? `${pad(p.h)}:${pad(p.mi)} doesn’t exist that night (the clocks go forward), so it is set to ${pad(r.at.h)}:${pad(r.at.mi)}.` : null);
    onChange(r.iso);
  };
  const defaultTime = (day) => {
    if (kind === 'end') return { h: 23, mi: 59 };
    if (sameDay(day, today)) { const n = partsOf(new Date(Date.now() + 5 * 60000).toISOString(), zone); return { h: n.h, mi: n.mi }; }
    return { h: 0, mi: 0 };
  };
  const pickDay = (date) => {
    if (!date) return;
    const t = new TZDate(date, zone);
    const day = { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
    put({ ...day, ...(sel ? { h: sel.h, mi: sel.mi } : defaultTime(day)) });
  };
  const plusDays = (n) => { const t = new TZDate(today.y, today.m, today.d + n, 12, 0, zone); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };
  const quick = kind === 'start'
    ? [{ label: 'Start now', run: () => put(null), on: !value }, { label: 'Today', run: () => put({ ...today, ...defaultTime(today) }) }, { label: 'Tomorrow', run: () => put({ ...plusDays(1), h: 0, mi: 0 }) }]
    : [{ label: 'Today', run: () => put({ ...today, h: 23, mi: 59 }) }, { label: 'Tomorrow', run: () => put({ ...plusDays(1), h: 23, mi: 59 }) }, { label: 'No expiration', run: () => put(null), on: !value }];

  // Days that can't be picked: an end before its start (or before today); a start after its end.
  const disabled = useMemo(() => {
    const rules = [];
    const dayOf = (iso) => { const p = partsOf(iso, zone); return new TZDate(p.y, p.m, p.d, zone); };
    const todayDate = new TZDate(today.y, today.m, today.d, zone);
    if (kind === 'end') {
      const start = after ? dayOf(after) : null;
      rules.push({ before: start && start > todayDate ? start : todayDate });
    } else {
      // A start already in the past (an offer that is running) stays pickable; otherwise no new start in the past.
      const from = value && new Date(value) < new Date() ? dayOf(value) : todayDate;
      rules.push({ before: from });
      if (before) rules.push({ after: dayOf(before) });
    }
    return rules;
  }, [kind, after, before, value, zone, today.y, today.m, today.d]);

  const thisYear = today.y;
  // With no day picked yet, the time inputs start from today's default and editing them picks today.
  const base = { ...today, ...defaultTime(today) };
  const selectedDate = sel ? new TZDate(sel.y, sel.m, sel.d, zone) : undefined;
  const shownOffset = offsetLabel(value || new Date().toISOString(), zone);

  return (
    <div className={`field sp ${error ? 'has-err' : ''}`} ref={wrap}>
      <label htmlFor={id}>{label}</label>
      <div className="sp-control" ref={refs.setReference}>
        <button ref={trigger} id={id} type="button" className={`sp-trigger ${value ? '' : 'is-unset'}`} aria-haspopup="dialog" aria-expanded={open}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-msg`}
          onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
          <Icon name="calendar" size={16} className="sp-ic" />
          <span className="sp-text" title={value ? `${formatWhen(value, zone)} (${zoneCity(zone)} time)` : undefined}>{value ? formatShort(value, zone) : empty}</span>
          {value && <span className="sp-zone" title={`${zoneCity(zone)} time`}>{offsetLabel(value, zone)}</span>}
          <Icon name="down" size={14} className="sp-caret" />
        </button>
        {value && <button type="button" className="sp-clear" aria-label={`Clear ${label.toLowerCase()} (${empty.toLowerCase()})`} title={empty} onClick={() => { put(null); trigger.current?.focus(); }}><Icon name="close" size={14} /></button>}
      </div>
      <span id={`${id}-msg`} className={error ? 'err' : 'hint'}>{error || note || hint}</span>

      {open && createPortal(
        <div ref={refs.setFloating} style={floatingStyles} className="sp-pop" role="dialog" aria-label={`${label}: pick a date and time`}>
          <div className="sp-quick" role="group" aria-label="Quick choices">
            {quick.map((q) => <button key={q.label} type="button" className={`sp-chip ${q.on ? 'on' : ''}`} aria-pressed={!!q.on} onClick={() => { q.run(); if (q.label === 'Start now' || q.label === 'No expiration') close(); }}>{q.label}</button>)}
          </div>
          <DayPicker
            mode="single" timeZone={zone} weekStartsOn={1} showOutsideDays fixedWeeks autoFocus
            captionLayout="dropdown" startMonth={new TZDate(thisYear - 1, 0, 1, zone)} endMonth={new TZDate(thisYear + 5, 11, 1, zone)}
            month={month} onMonthChange={setMonth} selected={selectedDate} onSelect={pickDay} disabled={disabled}
            labels={{ labelDayButton: (d, m) => `${new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)}${m.selected ? ', selected' : ''}${m.disabled ? ', not available' : ''}` }}
          />
          <div className="sp-time">
            <span className="sp-time-label"><Icon name="clock" size={14} />Time</span>
            <span className="sp-hm">
              <TimeInput label="Hour (0 to 23)" max={23} value={(sel || base).h} onChange={(h) => put({ ...(sel || base), h })} onEnter={() => close()} />
              <b aria-hidden="true">:</b>
              <TimeInput label="Minute (0 to 59)" max={59} value={(sel || base).mi} onChange={(mi) => put({ ...(sel || base), mi })} onEnter={() => close()} />
            </span>
          </div>
          {!sel && <p className="sp-tip">Pick a day, then the time ({kind === 'start' ? 'changing the time alone starts it today' : 'changing the time alone ends it today'}).</p>}
          {note && <p className="sp-tip warn">{note}</p>}
          <div className="sp-foot">
            <span className="sp-zone-line" title={zone}><Icon name="pin" size={13} />{zoneCity(zone)} time · {shownOffset}</span>
            <button type="button" className="btn primary sm" onClick={() => close()}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
