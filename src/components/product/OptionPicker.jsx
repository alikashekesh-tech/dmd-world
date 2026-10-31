import { useId } from 'react';
import { COLORS } from '../../data/index.js';
import { choicesFor, chooseOption } from '../../lib/variants.js';
import s from './OptionPicker.module.css';

/** A colour name the store knows ("Black", "Red") → its swatch colour. */
const swatchFor = (value) => Object.values(COLORS).find((c) => c.label?.toLowerCase() === String(value).trim().toLowerCase())?.hex || null;

/**
 * The options of a product sold in variants (Colour, Size, Dimensions, Edition…): one group of choices per option.
 * Real radio buttons, so arrow keys move within a group and screen readers name each one. A value that isn't sold with
 * the other choices, or is sold out, stays visible but says so; choosing it clears what no longer fits.
 */
export default function OptionPicker({ product: p, selected, onChange, invalid }) {
  const id = useId();
  return (
    <div className={s.picker}>
      {p.attributes.map((a) => {
        const choices = choicesFor(p, selected, a.name);
        const colour = /^colou?r$/i.test(a.name.trim());
        const missing = invalid && selected[a.name] == null;
        return (
          <fieldset key={a.name} className={s.group} aria-invalid={missing || undefined}>
            <legend>{a.name}<span className={missing ? s.need : undefined}>{selected[a.name] || (missing ? `Choose ${a.name.toLowerCase()}` : 'Choose one')}</span></legend>
            <div className={s.chips}>
              {choices.map((c) => {
                const on = selected[a.name] === c.value;
                const hex = colour ? swatchFor(c.value) : null;
                const note = !c.offered ? 'Not with your other choices' : !c.inStock ? 'Sold out' : null;
                return (
                  <label key={c.value} className={`${s.chip} ${on ? s.on : ''} ${note ? s.dim : ''}`} title={note || undefined}>
                    <input type="radio" name={`${id}-${a.name}`} value={c.value} checked={on} onChange={() => onChange(chooseOption(p, selected, a.name, c.value))} aria-describedby={note ? `${id}-${a.name}-${c.value}` : undefined} />
                    {hex && <i style={{ background: hex }} aria-hidden="true" />}
                    <span>{c.value}</span>
                    {note && <small id={`${id}-${a.name}-${c.value}`}>{c.offered ? 'Sold out' : 'Unavailable'}</small>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
