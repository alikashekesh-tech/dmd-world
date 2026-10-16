import { useEffect, useId, useRef, useState } from 'react';
import { useDebounced } from '../../lib/hooks.js';
import { Icon } from '../../ui/kit.jsx';

/**
 * A search box with a list of results to pick from (several, one after another: the list stays open). Arrow keys
 * move through the results, Enter picks, Escape closes. `load(q)` returns the results: an array (filtered here and
 * now, as the owner types) or, with `remote`, a promise (a server search, debounced; Enter waits for the answer to
 * the text typed, so it never picks from an older list). `render(item)` draws one; `picked(item)` marks the ones
 * already chosen (picking again removes them).
 */
export default function Finder({ load, render, picked, onPick, placeholder, minChars = 0, hint, label, remote = false }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ q: null, items: [] }); // remote results, and the text they answer
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 180);
  const wrap = useRef(null);
  const list = useRef(null);
  const typed = q.trim();
  const short = typed.length < minChars;
  // Local lists follow every keystroke; remote ones show only the answer to what is typed now.
  const items = short ? [] : remote ? (found.q === typed ? found.items : []) : load(typed);
  const waiting = remote && !short && found.q !== typed;

  useEffect(() => {
    if (!open || !remote || dq.trim().length < minChars) return undefined;
    let live = true;
    setBusy(true);
    load(dq.trim()).then((x) => { if (live) { setFound({ q: dq.trim(), items: x }); setActive(0); } })
      .catch(() => live && setFound({ q: dq.trim(), items: [] })).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [dq, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  // The results open under the box: bring them into view when that is below the fold.
  useEffect(() => { if (open && (items.length || short)) list.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) onPick(items[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className="finder" ref={wrap}>
      <label className="finder-box">
        <Icon name="search" size={16} />
        <span className="sr">{label || placeholder}</span>
        <input className="input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
          value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={key} />
        {(busy || waiting) && open && <span className="spin" />}
      </label>
      {open && (
        <div className="finder-pop" id={`${id}-list`} role="listbox" aria-multiselectable="true" ref={list}>
          {short ? <p className="finder-empty">{hint || `Type at least ${minChars} letters to search.`}</p>
            : !items.length ? <p className="finder-empty">{busy || waiting ? 'Searching…' : 'Nothing matches.'}</p>
              : items.map((it, i) => (
                <button key={it.id} id={`${id}-${i}`} data-i={i} type="button" role="option" aria-selected={picked(it)}
                  className={`finder-row ${i === active ? 'active' : ''} ${picked(it) ? 'on' : ''}`}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(it)}>
                  <span className={`finder-check ${picked(it) ? 'on' : ''}`} aria-hidden="true">{picked(it) && <Icon name="check" size={12} />}</span>
                  {render(it)}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
