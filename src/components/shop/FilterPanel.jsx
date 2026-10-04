import { useState } from 'react';
import { facetOptions, facetLabel, FACET_LABELS, FAMILY_HEX, money } from '../../data/index.js';
import { StarIcon, CheckIcon, ChevronDown } from '../common/icons.jsx';
import s from './FilterPanel.module.css';

function Group({ title, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={s.group}>
      <button type="button" className={s.gHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}{badge ? <i>{badge}</i> : null}</span><ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && <div className={s.gBody}>{children}</div>}
    </section>
  );
}

function CheckList({ k, opts, selected, toggle, limit = 7 }) {
  const [all, setAll] = useState(false);
  const list = all ? opts : opts.slice(0, limit);
  return (
    <>
      <ul className={s.list}>
        {list.map((o) => {
          const on = selected.includes(o.value);
          const disabled = !on && o.count === 0;
          return (
            <li key={o.value}>
              <label className={`${s.check} ${disabled ? s.dis : ''}`}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(k, o.value)} />
                <span className={s.box}>{on && <CheckIcon size={13} />}</span>
                <span className={s.lab}>{facetLabel(k, o.value)}</span>
                <span className={s.cnt}>{o.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {opts.length > limit && <button type="button" className={s.more} onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${opts.length}`}</button>}
    </>
  );
}

export default function FilterPanel({ base, keys, state, toggle, update, bounds }) {
  const presets = [[0, 50], [50, 100], [100, 250], [250, Infinity]].filter(([a, b]) => b > bounds.min && a < bounds.max);
  return (
    <div className={s.panel}>
      {keys.map((k) => {
        const opts = facetOptions(base, state, k);
        const sel = state[k] || [];
        if (opts.length < 2 && sel.length === 0) return null;
        if (k === 'color') {
          return (
            <Group key={k} title={FACET_LABELS[k]} badge={sel.length || null}>
              <ul className={s.swatches}>
                {opts.map((o) => {
                  const on = sel.includes(o.value);
                  return (
                    <li key={o.value}>
                      <button type="button" aria-pressed={on} aria-label={`${o.value} (${o.count})`} disabled={!on && o.count === 0} onClick={() => toggle(k, o.value)} className={`${s.sw} ${on ? s.swOn : ''}`}>
                        <i style={{ background: FAMILY_HEX[o.value] }} />{on && <CheckIcon size={13} />}
                      </button>
                      <span>{o.value}</span>
                    </li>
                  );
                })}
              </ul>
            </Group>
          );
        }
        return <Group key={k} title={FACET_LABELS[k]} badge={sel.length || null}><CheckList k={k} opts={opts} selected={sel} toggle={toggle} limit={k === 'brand' ? 7 : 8} /></Group>;
      })}

      <Group title="Price">
        <div className={s.price}>
          <label><span>Min</span><input className="input" inputMode="numeric" type="number" min={0} placeholder={String(Math.floor(bounds.min))} value={state.price && state.price[0] > 0 ? state.price[0] : ''} onChange={(e) => update({ price: `${e.target.value || 0}-${state.price && state.price[1] !== Infinity ? state.price[1] : ''}` })} /></label>
          <i>–</i>
          <label><span>Max</span><input className="input" inputMode="numeric" type="number" min={0} placeholder={String(Math.ceil(bounds.max))} value={state.price && state.price[1] !== Infinity ? state.price[1] : ''} onChange={(e) => update({ price: `${state.price ? state.price[0] : 0}-${e.target.value}` })} /></label>
        </div>
        <div className={s.presets}>
          {presets.map(([a, b]) => {
            const on = state.price && state.price[0] === a && state.price[1] === b;
            return <button key={a} type="button" className={on ? s.pOn : ''} onClick={() => update({ price: on ? null : `${a}-${b === Infinity ? '' : b}` })}>{b === Infinity ? `${money(a)}+` : a === 0 ? `Under ${money(b)}` : `${money(a)} – ${money(b)}`}</button>;
          })}
        </div>
      </Group>

      <Group title="Rating">
        <ul className={s.list}>
          {[4, 3].map((r) => (
            <li key={r}>
              <label className={s.check}>
                <input type="radio" name="rating" checked={state.rating === r} onChange={() => update({ rating: state.rating === r ? null : r })} onClick={() => state.rating === r && update({ rating: null })} />
                <span className={`${s.box} ${s.radio}`}>{state.rating === r && <i />}</span>
                <span className={s.lab}><span className={s.stars}>{[1, 2, 3, 4, 5].map((i) => <StarIcon key={i} size={13} fill={i <= r ? '#ffc23d' : '#d5dce7'} />)}</span> &amp; up</span>
              </label>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Availability">
        <label className={s.check}>
          <input type="checkbox" checked={!!state.stock} onChange={() => update({ stock: state.stock ? null : 'in' })} />
          <span className={s.box}>{state.stock && <CheckIcon size={13} />}</span>
          <span className={s.lab}>In stock only</span>
        </label>
      </Group>
    </div>
  );
}
