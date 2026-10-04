import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from '../../router/index.jsx';
import { search, money, getBrand } from '../../data/index.js';
import { DMD_GROUPS, catUrl } from '../../data/dmdMenu.js';
import { ProductImage } from '../art/Media.jsx';
import { SearchIcon, CloseIcon } from '../common/icons.jsx';
import { useCatalog } from '../../data/live.js';
import s from './SearchBox.module.css';

export default function SearchBox({ autoFocus, onDone, variant = 'bar', placeholder = 'Search products, brands, categories...' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
  const nav = useNavigate();
  const ref = useRef(null);
  const version = useCatalog();
  const listId = useId();
  const results = useMemo(() => search(q, 6), [q, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => (q.trim().length > 1 ? DMD_GROUPS.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 3) : []), [q]);

  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = (to) => { setOpen(false); setQ(''); onDone?.(); nav(to); };
  const submit = (e) => {
    e.preventDefault();
    if (idx >= 0 && results[idx]) return go(`/product/${results[idx].slug}`);
    if (q.trim()) go(`/shop?q=${encodeURIComponent(q.trim())}`);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(-1, i - 1)); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className={`${s.wrap} ${s[variant]}`} ref={ref}>
      <form className={s.form} role="search" onSubmit={submit}>
        <SearchIcon size={18} />
        <input
          type="search" value={q} autoFocus={autoFocus} placeholder={placeholder} aria-label="Search the store"
          role="combobox" aria-expanded={open && q.trim().length > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={idx >= 0 && results[idx] ? `${listId}-${idx}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          autoComplete="off" enterKeyHint="search"
        />
        {q && <button type="button" className={s.clear} onClick={() => setQ('')} aria-label="Clear search"><CloseIcon size={16} /></button>}
      </form>
      {open && q.trim().length > 0 && (
        <div className={s.panel} role="listbox" id={listId} aria-label="Search suggestions">
          {cats.length > 0 && <div className={s.cats}>{cats.map((c) => <button key={c.slug} type="button" onClick={() => go(catUrl(c.slug))}>{c.name}</button>)}</div>}
          {results.length === 0 ? <p className={s.empty} role="status">No products found for “{q}”. Try a brand, a console or a shorter word.</p> : results.map((p, i) => (
            <button key={p.id} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === idx} className={`${s.row} ${i === idx ? s.active : ''}`} onClick={() => go(`/product/${p.slug}`)}>
              <span className={s.thumb}><ProductImage product={p} color={p.colors[0]} /></span>
              <span className={s.meta}><small>{getBrand(p.brand).name}</small><span>{p.name}</span></span>
              <b>{money(p.price)}</b>
            </button>
          ))}
          <button type="button" className={s.all} onClick={() => go(`/shop?q=${encodeURIComponent(q.trim())}`)}>See all results for “{q}”</button>
        </div>
      )}
    </div>
  );
}
