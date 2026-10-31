import { useState } from 'react';
import { Button, Chip, Notice, Toggle, useUi } from '../../ui/kit.jsx';
import { MAX_OPTIONS, MAX_VALUES, MAX_VARIANTS, OPTION_NAMES, cleanOptions, missingCombinations, duplicateRows, remapOptions, comboLabel } from '../../lib/variants.js';

let rowSeq = 0;
/** A new, empty variant row (price and stock to fill in). */
export const blankVariant = (options = {}) => ({ key: `n${++rowSeq}`, id: null, options, sku: '', regular_price: '', sale_price: '', track_stock: true, stock_quantity: '0', stock_status: 'in_stock', image_url: '', is_active: true });
/** A saved variant → an editable row. */
export const variantRow = (v) => ({
  key: `v${v.id}`, id: v.id, options: { ...(v.options || {}) }, sku: v.sku || '', regular_price: String(v.regular_price ?? ''), sale_price: v.sale_price != null ? String(v.sale_price) : '',
  track_stock: !!v.track_stock, stock_quantity: String(v.stock_quantity ?? 0), stock_status: v.stock_status || 'in_stock', image_url: v.image_url || '', is_active: v.is_active !== false,
});

/** Values of one option: chips, and a box that adds one on Enter or comma. */
function Values({ values, onChange, label }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const fresh = parts.filter((x) => !values.some((v) => v.toLowerCase() === x.toLowerCase()));
    onChange([...values, ...fresh].slice(0, MAX_VALUES));
    setDraft('');
  };
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {values.map((v) => (
        <span key={v} className="chip blue" style={{ gap: 4 }}>{v}<button type="button" className="linkish" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>
      ))}
      <input className="input" style={{ width: 170, height: 32 }} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} placeholder={values.length ? 'Add another' : 'e.g. Black, Red, White'} aria-label={`Add a ${label || 'value'}`} />
    </div>
  );
}

/**
 * Options (Colour, Size, Dimensions…) and the variants sold, each with its own SKU, price, sale, stock, photo and on/off
 * switch. Combinations are only added when asked ("Add missing combinations" or one at a time), never all on their own.
 */
export default function VariantEditor({ options, variants, images, onChange, saved }) {
  const { confirm } = useUi();
  const clean = cleanOptions(options);
  const dups = duplicateRows(variants);
  const missing = missingCombinations(clean, variants);
  const setOptions = (next) => {
    const before = cleanOptions(options);
    const after = cleanOptions(next);
    // Variant rows follow a renamed option and lose a value that was removed (they must be chosen again).
    const rows = after.length === before.length ? variants.map((v) => ({ ...v, options: remapOptions(v.options, before, after) })) : variants;
    onChange({ options: next, variants: rows });
  };
  const setOption = (i, patch) => setOptions(options.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const setRow = (i, patch) => onChange({ options, variants: variants.map((v, k) => (k === i ? { ...v, ...patch } : v)) });
  const addMissing = async () => {
    const room = MAX_VARIANTS - variants.length;
    const adding = missing.slice(0, room);
    if (adding.length > 20 && !(await confirm({ title: `Add ${adding.length} variants?`, text: 'One for every combination not in the list yet. Fill in each price before saving; switch off the ones you don’t sell.', confirmLabel: `Add ${adding.length}` }))) return;
    onChange({ options, variants: [...variants, ...adding.map((c) => blankVariant(c))] });
  };

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 10 }}>
        <span className="label">Options</span>
        {options.map((o, i) => (
          <div key={i} className="surface" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" style={{ width: 180 }} list="dmd-option-names" value={o.name} onChange={(e) => setOption(i, { name: e.target.value })} placeholder="Option name, e.g. Colour" aria-label={`Option ${i + 1} name`} />
              <span className="grow" />
              <Button size="sm" variant="quiet" icon="close" aria-label={`Remove option ${o.name || i + 1}`} onClick={() => setOptions(options.filter((_, k) => k !== i))} />
            </div>
            <Values values={o.values} label={o.name.toLowerCase()} onChange={(values) => setOption(i, { values })} />
          </div>
        ))}
        <datalist id="dmd-option-names">{OPTION_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
        {options.length < MAX_OPTIONS && <Button size="sm" icon="plus" onClick={() => setOptions([...options, { name: '', values: [] }])} style={{ justifySelf: 'start' }}>Add an option</Button>}
      </div>

      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <span className="label" style={{ marginRight: 'auto' }}>Variants · {variants.length}</span>
        <Button size="sm" icon="plus" disabled={!clean.length || !missing.length || variants.length >= MAX_VARIANTS} onClick={addMissing}>{missing.length ? `Add missing combinations (${missing.length})` : 'All combinations added'}</Button>
        <Button size="sm" icon="plus" disabled={!clean.length || variants.length >= MAX_VARIANTS} onClick={() => onChange({ options, variants: [...variants, blankVariant()] })}>Add a variant</Button>
      </div>
      {!clean.length && <Notice icon="info">Add an option and its values first (Colour: Black, Red…), then the variants you sell.</Notice>}
      {dups.size > 0 && <Notice tone="coral" icon="alert">Two rows have the same combination. Each combination can only be sold once: change or remove the highlighted row.</Notice>}

      {variants.length > 0 && (
        <ul className="variant-list">
          {variants.map((v, i) => {
            const was = saved?.find((x) => x.id === v.id);
            const n = i + 1;
            return (
              <li key={v.key} className={`variant-card${dups.has(i) ? ' dup' : ''}${v.is_active ? '' : ' off'}`}>
                <div className="variant-head">
                  {clean.map((o) => (
                    <select key={o.name} className="select" value={v.options[o.name] || ''} aria-label={`${o.name} of variant ${n}`}
                      onChange={(e) => setRow(i, { options: { ...v.options, [o.name]: e.target.value } })}>
                      <option value="">{o.name}…</option>
                      {o.values.map((val) => <option key={val} value={val}>{val}</option>)}
                    </select>
                  ))}
                  {!v.id && <Chip tone="blue">New</Chip>}
                  {dups.has(i) && <Chip tone="coral">Same as another row</Chip>}
                  <span className="grow" />
                  <span className="variant-onsale"><Toggle checked={v.is_active} onChange={(on) => setRow(i, { is_active: on })} label={v.is_active ? 'On sale' : 'Off'} /></span>
                  <Button size="sm" variant="quiet" icon="trash" aria-label={`Remove variant ${comboLabel(clean, v.options) || n}`} onClick={() => onChange({ options, variants: variants.filter((_, k) => k !== i) })} />
                </div>
                <div className="variant-fields">
                  <label className="vf"><span>SKU</span><input className="input mono" value={v.sku} onChange={(e) => setRow(i, { sku: e.target.value })} placeholder="Optional" aria-label={`SKU of variant ${n}`} /></label>
                  <label className="vf"><span>Price</span><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={v.regular_price} onChange={(e) => setRow(i, { regular_price: e.target.value })} aria-label={`Price of variant ${n}`} /></span></label>
                  <label className="vf"><span>Sale price</span><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={v.sale_price} onChange={(e) => setRow(i, { sale_price: e.target.value })} placeholder="None" aria-label={`Sale price of variant ${n}`} /></span></label>
                  <div className="vf"><span>{v.track_stock ? 'Stock' : 'Availability'}</span>
                    {v.track_stock
                      ? <input className="input mono" type="number" min="0" step="1" value={v.stock_quantity} onChange={(e) => setRow(i, { stock_quantity: e.target.value })} aria-label={`Stock of variant ${n}`} />
                      : <select className="select" value={v.stock_status} onChange={(e) => setRow(i, { stock_status: e.target.value })} aria-label={`Availability of variant ${n}`}><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option></select>}
                    <Toggle checked={v.track_stock} onChange={(on) => setRow(i, { track_stock: on })} label="Count stock" />
                    {was && v.track_stock && String(was.stock_quantity) !== String(v.stock_quantity) && <small>Was {was.stock_quantity}: saved as a stocktake</small>}
                  </div>
                  <label className="vf"><span>Photo</span>
                    <select className="select" value={v.image_url} onChange={(e) => setRow(i, { image_url: e.target.value })} aria-label={`Photo of variant ${n}`} disabled={!images.length}>
                      <option value="">Main photo</option>
                      {images.map((im, k) => <option key={im.url} value={im.url}>Photo {k + 1}</option>)}
                    </select>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {variants.some((v) => v.id) && <span className="muted" style={{ fontSize: 12.5 }}>A removed variant stays in past orders and the stock history. Switch one off instead to keep it for later.</span>}
      {variants.length > 0 && <span className="row" style={{ gap: 6 }}><Chip tone="muted">Tip</Chip><span className="muted" style={{ fontSize: 12.5 }}>Customers only see the variants that are on, and can’t buy one that’s out of stock.</span></span>}
    </div>
  );
}
