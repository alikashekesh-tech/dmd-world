import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { ProductImage } from '../art/Media.jsx';
import { CloseIcon, TrashIcon, PlusIcon, MinusIcon } from '../common/icons.jsx';
import { money, getBrand, COLORS, deliveryFee, deliveryLabel } from '../../data/index.js';
import { useDialog } from '../../lib/useDialog.js';
import LineArt from '../art/LineArt.jsx';
import { lineDetails, withVariantImage } from '../../lib/variants.js';
import { liveQty, qtyDraft, settleQty } from '../../lib/quantity.js';
import s from './CartDrawer.module.css';

/**
 * `max`: the most that can be chosen (the stock left after what's in the cart); no stock limit when it isn't tracked.
 * The number can be typed: digits only, kept as typed until it's a valid quantity, settled when the box is left (empty:
 * back to the last one; 0: 1; too many: `max`, and `onLimit(max)` is called, or the stepper says so itself).
 */
export function QtyStepper({ value, onChange, size = 'md', max = Infinity, label, onLimit }) {
  const top = Math.max(1, max);
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  const [note, setNote] = useState('');
  if (seen !== value) { setSeen(value); setDraft(String(value)); } // changed from outside: the buttons, a new variant
  const typed = liveQty(draft, top);
  const shown = typed ?? value; // what the buttons count from
  const say = (text) => (onLimit ? onLimit(text ? top : null) : setNote(text));
  const change = (n) => { say(''); setDraft(String(n)); onChange(n); };
  const settle = () => {
    const { value: n, limited } = settleQty(draft, { max: top, current: value });
    setDraft(String(n));
    if (n !== value) onChange(n);
    say(limited ? `Only ${top} available` : '');
  };
  const name = label ? `Quantity of ${label}` : 'Quantity';
  return (
    <span className={s.qtyWrap}>
      <span className={`${s.qty} ${s[size]}`} role="group" aria-label={name}>
        <button type="button" aria-label="Decrease quantity" onClick={() => change(Math.max(1, shown - 1))} disabled={shown <= 1}><MinusIcon size={15} /></button>
        <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" aria-label={name} value={draft}
          onChange={(e) => { const d = qtyDraft(e.target.value); setDraft(d); const n = liveQty(d, top); if (n != null && n !== value) onChange(n); }}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); settle(); }
            else if (e.key === 'ArrowUp' && shown < top) { e.preventDefault(); change(shown + 1); }
            else if (e.key === 'ArrowDown' && shown > 1) { e.preventDefault(); change(shown - 1); }
          }} />
        <button type="button" aria-label="Increase quantity" onClick={() => change(Math.min(top, shown + 1))} disabled={shown >= top}><PlusIcon size={15} /></button>
      </span>
      {!onLimit && note && <small className={s.qtyNote} role="status">{note}</small>}
    </span>
  );
}

export default function CartDrawer() {
  const { drawer, setDrawer, lines, subtotal, count, setQty, removeLine, lineMax } = useStore();
  const close = () => setDrawer(false);
  const panel = useDialog(drawer, close);
  return (
    <div className={`${s.root} ${drawer ? s.open : ''}`} aria-hidden={!drawer}>
      <div className={s.scrim} onClick={close} />
      <aside ref={panel} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <header className={s.head}><h2 id="cart-title">Your cart <small>{count} {count === 1 ? 'item' : 'items'}</small></h2><button type="button" onClick={close} aria-label="Close cart" className={s.close}><CloseIcon /></button></header>
        <div className={s.list}>
          {lines.length === 0 ? (
            <div className={s.empty}><LineArt type="bag" /><p>Inventory: 0</p><h3>Your cart is empty</h3><p>Find something for your setup and it will wait here.</p><Link to="/shop" className="btn btn--primary" onClick={close}>Shop gaming gear</Link></div>
          ) : lines.map((l) => (
            <div key={l.key} className={s.line}>
              <Link to={`/product/${l.product.slug}`} onClick={close} className={s.thumb} tabIndex={-1} aria-hidden="true"><ProductImage product={withVariantImage(l.product, l.variantInfo)} color={l.color} /></Link>
              <div className={s.info}>
                <small>{getBrand(l.product.brand).name}</small>
                <Link to={`/product/${l.product.slug}`} onClick={close}>{l.product.name}</Link>
                {lineDetails(l) && <span className={s.variant}>{lineDetails(l)}</span>}
                {l.color && COLORS[l.color] && <span className={s.variant}><i style={{ background: COLORS[l.color].hex }} />{COLORS[l.color].label}</span>}
                {(l.variantInfo || l.product).stock === 'out' && <span className={s.out}>Sold out: remove it to check out</span>}
                <div className={s.lineFoot}><QtyStepper value={l.qty} onChange={(q) => setQty(l.key, q)} size="sm" label={l.product.name} max={lineMax(l.key)} /><b>{money(l.qty * l.price)}</b></div>
              </div>
              <button type="button" className={s.rm} onClick={() => removeLine(l.key)} aria-label={`Remove ${l.product.name}`}><TrashIcon size={17} /></button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <footer className={s.foot}>
            <dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Delivery</dt><dd>{deliveryLabel(deliveryFee('delivery', lines.map((l) => l.product)))}</dd></div></dl>
            <Link to="/checkout" className="btn btn--primary btn--lg btn--block" onClick={close}>Checkout · {money(subtotal)}</Link>
            <Link to="/cart" className="btn btn--secondary btn--block" onClick={close}>View cart</Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
