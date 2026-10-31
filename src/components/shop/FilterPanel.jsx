import { useId, useState } from 'react';
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

/** One choice in a single-select group (a radio, styled like the rest of the panel). */
function Radio({ name, checked, disabled, onChange, children, count }) {
  return (
    <label className={`${s.check} ${checked ? s.on : ''} ${disabled ? s.dis : ''}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span className={`${s.box} ${s.radio}`}>{checked && <i />}</span>
      <span className={s.lab}>{children}</span>
      {count != null && <span className={s.cnt}>{count}</span>}
    </label>
  );
}

/** A filter group where one value can be chosen ("All" clears it). Values with nothing to show are left out. */
function RadioList({ name, k, opts, selected, toggle, all, limit = 7 }) {
  const [more, setMore] = useState(false);
  const shown = opts.filter((o) => o.count > 0 || o.value === selected);
  const list = more ? shown : shown.slice(0, limit);
  if (selected && !list.some((o) => o.value === selected)) list.push(shown.find((o) => o.value === selected));
  return (
    <>
      <ul className={s.list}>
        <li><Radio name={name} checked={!selected} onChange={() => selected && toggle(k, selected)}>{all}</Radio></li>
        {list.map((o) => (
          <li key={o.value}><Radio name={name} checked={o.value === selected} onChange={() => toggle(k, o.value)} count={o.count}>{facetLabel(k, o.value)}</Radio></li>
        ))}
      </ul>
      {shown.length > limit && <button type="button" className={s.more} onClick={() => setMore(!more)}>{more ? 'Show less' : `Show all ${shown.length}`}</button>}
    </>
  );
}

const pathTo = (opts, key, trail = []) => {
  for (const o of opts) {
    if (o.key === key) return [...trail, o];
    const hit = pathTo(o.children, key, [...trail, o]);
    if (hit) return hit;
  }
  return null;
};

/** The category tree: main categories first, each opening onto its sub-categories; one is chosen at a time. */
function CategoryTree({ name, options, selected, onPick }) {
  const trail = (selected && pathTo(options, selected)) || [];
  const [open, setOpen] = useState(() => new Set(trail.slice(0, -1).map((o) => o.key)));
  // A choice made elsewhere (a link, Back/Forward) opens the branch it is in.
  const [was, setWas] = useState(selected);
  if (was !== selected) { setWas(selected); setOpen((cur) => new Set([...cur, ...trail.slice(0, -1).map((o) => o.key)])); }
  const flip = (key) => setOpen((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const rows = (opts, depth) => (
    <ul className={depth ? s.sublist : s.list}>
      {opts.map((o) => {
        const kids = o.children.length > 0;
        const isOpen = open.has(o.key);
        const id = `${name}-${o.key.replace(/[^a-z0-9]+/gi, '-')}`;
        return (
          <li key={o.key}>
            <div className={s.node}>
              <Radio name={name} checked={selected === o.key} disabled={o.count === 0 && selected !== o.key} onChange={() => onPick(o.key)} count={o.count}>{o.label}</Radio>
              {kids && (
                <button type="button" className={s.twist} aria-expanded={isOpen} aria-controls={id} aria-label={`${isOpen ? 'Hide' : 'Show'} ${o.label} sub-categories`} onClick={() => flip(o.key)}>
                  <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
              )}
            </div>
            {kids && isOpen && <div id={id}>{rows(o.children, depth + 1)}</div>}
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <ul className={s.list}><li><Radio name={name} checked={!selected} onChange={() => onPick(null)}>All categories</Radio></li></ul>
      {rows(options, 0)}
    </>
  );
}

export default function FilterPanel({ base, keys, state, toggle, update, bounds, categories = [] }) {
  const name = useId();
  const presets = [[0, 50], [50, 100], [100, 250], [250, Infinity]].filter(([a, b]) => b > bounds.min && a < bounds.max);
  const stock = Object.fromEntries(facetOptions(base, state, 'stock').map((o) => [o.value, o.count]));
  return (
    <div className={s.panel}>
      {categories.length > 0 && (
        <Group title="Category" badge={state.cat ? 1 : null}>
          <CategoryTree name={`${name}cat`} options={categories} selected={state.cat || null} onPick={(key) => update({ cat: key })} />
        </Group>
      )}

      {keys.map((k) => {
        const opts = facetOptions(base, state, k);
        const sel = state[k]?.[0] || null;
        if (opts.filter((o) => o.count > 0).length < 2 && !sel) return null;
        if (k === 'color') {
          return (
            <Group key={k} title={FACET_LABELS[k]} badge={sel ? 1 : null}>
              <ul className={s.swatches} role="radiogroup" aria-label={FACET_LABELS[k]}>
                {opts.map((o) => {
                  const on = sel === o.value;
                  return (
                    <li key={o.value}>
                      <button type="button" role="radio" aria-checked={on} aria-label={`${o.value} (${o.count})`} disabled={!on && o.count === 0} onClick={() => toggle(k, o.value)} className={`${s.sw} ${on ? s.swOn : ''}`}>
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
        return <Group key={k} title={FACET_LABELS[k]} badge={sel ? 1 : null}><RadioList name={`${name}${k}`} k={k} opts={opts} selected={sel} toggle={toggle} all={k === 'brand' ? 'All brands' : 'Any'} limit={k === 'brand' ? 7 : 8} /></Group>;
      })}

      <Group title="Price">
        <div className={s.price}>
          <label><span>Min</span><input className="input" inputMode="numeric" type="number" min={0} placeholder={String(Math.floor(bounds.min))} value={state.price && state.price[0] > 0 ? state.price[0] : ''} onChange={(e) => update({ price: `${e.target.value || 0}-${state.price && state.price[1] !== Infinity ? state.price[1] : ''}` }, { typing: true })} /></label>
          <i>–</i>
          <label><span>Max</span><input className="input" inputMode="numeric" type="number" min={0} placeholder={String(Math.ceil(bounds.max))} value={state.price && state.price[1] !== Infinity ? state.price[1] : ''} onChange={(e) => update({ price: `${state.price ? state.price[0] : 0}-${e.target.value}` }, { typing: true })} /></label>
        </div>
        <div className={s.presets}>
          {presets.map(([a, b]) => {
            const on = state.price && state.price[0] === a && state.price[1] === b;
            return <button key={a} type="button" aria-pressed={!!on} className={on ? s.pOn : ''} onClick={() => update({ price: on ? null : `${a}-${b === Infinity ? '' : b}` })}>{b === Infinity ? `${money(a)}+` : a === 0 ? `Under ${money(b)}` : `${money(a)} – ${money(b)}`}</button>;
          })}
        </div>
      </Group>

      <Group title="Rating">
        <ul className={s.list}>
          <li><Radio name={`${name}rating`} checked={!state.rating} onChange={() => update({ rating: null })}>Any rating</Radio></li>
          {[4, 3].map((r) => (
            <li key={r}>
              <Radio name={`${name}rating`} checked={state.rating === r} onChange={() => update({ rating: r })}>
                <span className={s.stars}>{[1, 2, 3, 4, 5].map((i) => <StarIcon key={i} size={13} fill={i <= r ? '#ffc23d' : '#d5dce7'} />)}</span> &amp; up
              </Radio>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Availability">
        <ul className={s.list}>
          <li><Radio name={`${name}stock`} checked={!state.stock} onChange={() => update({ stock: null })}>Any</Radio></li>
          {[['in', 'In stock'], ['out', 'Out of stock']].map(([v, label]) => (
            <li key={v}><Radio name={`${name}stock`} checked={state.stock?.[0] === v} disabled={!stock[v] && state.stock?.[0] !== v} onChange={() => update({ stock: v })} count={stock[v] || 0}>{label}</Radio></li>
          ))}
        </ul>
      </Group>
    </div>
  );
}
