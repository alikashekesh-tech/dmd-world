import { Link } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { ProductImage } from '../art/Media.jsx';
import { CloseIcon, TrashIcon, PlusIcon, MinusIcon } from '../common/icons.jsx';
import { money, getBrand, COLORS } from '../../data/index.js';
import { useDialog } from '../../lib/useDialog.js';
import LineArt from '../art/LineArt.jsx';
import s from './CartDrawer.module.css';

/** `max`: the most that can be chosen (the product's stock left); no stock limit when it isn't tracked. */
export function QtyStepper({ value, onChange, size = 'md', max = Infinity, label }) {
  const top = Math.max(1, max);
  return (
    <div className={`${s.qty} ${s[size]}`} role="group" aria-label={label ? `Quantity of ${label}` : 'Quantity'}>
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(value - 1)} disabled={value <= 1}><MinusIcon size={15} /></button>
      <span aria-live="polite" aria-atomic="true">{value}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => onChange(value + 1)} disabled={value >= top}><PlusIcon size={15} /></button>
    </div>
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
              <Link to={`/product/${l.product.slug}`} onClick={close} className={s.thumb} tabIndex={-1} aria-hidden="true"><ProductImage product={l.product} color={l.color} /></Link>
              <div className={s.info}>
                <small>{getBrand(l.product.brand).name}</small>
                <Link to={`/product/${l.product.slug}`} onClick={close}>{l.product.name}</Link>
                {l.color && COLORS[l.color] && <span className={s.variant}><i style={{ background: COLORS[l.color].hex }} />{COLORS[l.color].label}</span>}
                {l.product.stock === 'out' && <span className={s.out}>Sold out: remove it to check out</span>}
                <div className={s.lineFoot}><QtyStepper value={l.qty} onChange={(q) => setQty(l.key, q)} size="sm" label={l.product.name} max={lineMax(l.key)} /><b>{money(l.qty * l.product.price)}</b></div>
              </div>
              <button type="button" className={s.rm} onClick={() => removeLine(l.key)} aria-label={`Remove ${l.product.name}`}><TrashIcon size={17} /></button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <footer className={s.foot}>
            <dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Delivery</dt><dd>Confirmed on order</dd></div></dl>
            <Link to="/checkout" className="btn btn--primary btn--lg btn--block" onClick={close}>Checkout · {money(subtotal)}</Link>
            <Link to="/cart" className="btn btn--secondary btn--block" onClick={close}>View cart</Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
