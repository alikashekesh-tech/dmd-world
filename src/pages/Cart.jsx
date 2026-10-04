import { Link } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { ProductImage } from '../components/art/Media.jsx';
import { QtyStepper } from '../components/layout/CartDrawer.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LineArt from '../components/art/LineArt.jsx';
import ProductGrid from '../components/product/ProductGrid.jsx';
import { TrashIcon, PhoneIcon, ArrowRight } from '../components/common/icons.jsx';
import { money, getBrand, COLORS, PRODUCTS } from '../data/index.js';
import { CONTACT } from '../data/dmdMenu.js';
import { useQuote } from '../lib/useQuote.js';
import { usePageMeta } from '../lib/meta.js';
import s from './Cart.module.css';

/* The summary is an ink "receipt": mono line items, one big total, and the action that moves you forward.
   With a live quote it shows the store's own prices and discount; without one, the catalog's. */
export function OrderSummary({ children, showItems, quote, checking }) {
  const { lines, subtotal: shown, savings, count } = useStore();
  const live = (id) => quote?.lines.find((q) => q.id === Number(id));
  const subtotal = quote ? quote.subtotal : shown;
  const discount = quote?.discount || 0;
  const total = quote ? quote.total : shown;
  const changed = quote && lines.some((l) => { const q = live(l.id); return q && !q.problem && Math.abs(q.price - l.product.price) > 0.004; });
  return (
    <aside className={s.summary} aria-label="Order summary" aria-busy={checking || undefined}>
      <p className={s.sumHud}>Order summary <span>{count} {count === 1 ? 'item' : 'items'}</span></p>
      {showItems && (
        <ul className={s.mini}>{lines.map((l) => {
          const q = live(l.id);
          const unit = q && !q.problem ? q.price : l.product.price;
          return (
            <li key={l.key} className={q?.problem ? s.miniBad : undefined}>
              <span className={s.miniThumb}><ProductImage product={l.product} color={l.color} /><i>{l.qty}</i></span>
              <span><b>{l.product.name}</b><small>{q?.problem ? q.code === 'low_stock' ? `Only ${q.max} left` : 'Not available' : getBrand(l.product.brand).name}{l.color && COLORS[l.color] ? ` · ${COLORS[l.color].label}` : ''}</small></span>
              <em>{money(l.qty * unit)}</em>
            </li>
          );
        })}</ul>
      )}
      {changed && <p className={s.updated} role="status">Prices were updated to the store’s current prices.</p>}
      <dl>
        <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
        {!quote && savings > 0 && <div className={s.save}><dt>You save</dt><dd>−{money(savings)}</dd></div>}
        {discount > 0 && <div className={s.save}><dt>Code {quote.coupon?.code}</dt><dd>−{money(discount)}</dd></div>}
        <div><dt>Delivery</dt><dd>Confirmed on order</dd></div>
        <div className={s.total}><dt>Total</dt><dd>{money(total)}</dd></div>
      </dl>
      {children}
      <p className={s.secure}><PhoneIcon size={14} />Questions? Call {CONTACT.phone}</p>
    </aside>
  );
}

export default function Cart() {
  usePageMeta({ title: 'Your cart', noindex: true });
  const { lines, count, setQty, removeLine, clearCart, restoreCart, setToast } = useStore();
  const [quote, checking] = useQuote(lines);
  const problemOf = (id) => quote?.lines.find((q) => q.id === Number(id) && q.problem);
  const blocked = lines.some((l) => problemOf(l.id));
  const suggestions = PRODUCTS.filter((p) => p.price < 30 && p.stock !== 'out' && !lines.some((l) => l.id === p.id)).sort((a, b) => b.sold - a.sold).slice(0, 4);
  const snapshot = () => lines.map(({ key, id, color, qty }) => ({ key, id, color, qty }));
  const clear = () => { const before = snapshot(); clearCart(); setToast({ text: 'Cart cleared', undo: () => restoreCart(before) }); };
  const remove = (l) => { const before = snapshot(); removeLine(l.key); setToast({ text: `Removed ${l.product.name}`, undo: () => restoreCart(before) }); };
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Cart' }]}
        eyebrow={`Inventory · ${count} ${count === 1 ? 'item' : 'items'}`}
        title="Your cart"
        lead={lines.length ? 'Check quantities, then head to checkout. DMD confirms delivery with you after you order.' : null}
        art={<LineArt type="bag" />}
      />
      <div className="container">
        {lines.length === 0 ? (
          <div className={s.emptyWrap}>
            <EmptyState art={<LineArt type="bag" />} status="Inventory: 0" title="Your cart is empty" text="Nothing here yet. Browse the shop and add something for your setup.">
              <Link to="/shop" className="btn btn--primary btn--lg">Shop gaming gear <ArrowRight size={17} /></Link>
              <Link to="/product-category/new-offers" className="btn btn--secondary btn--lg">See price drops</Link>
            </EmptyState>
          </div>
        ) : (
          <div className={s.layout}>
            <div>
              <ul className={s.lines}>
                {lines.map((l, i) => {
                  const bad = problemOf(l.id);
                  const live = quote?.lines.find((q) => q.id === Number(l.id));
                  const unit = live && !live.problem ? live.price : l.product.price;
                  return (
                    <li key={l.key} className={`${s.line} ${bad ? s.lineBad : ''}`} style={{ '--i': i }}>
                      <Link to={`/product/${l.product.slug}`} className={s.thumb}><ProductImage product={l.product} color={l.color} /></Link>
                      <div className={s.info}>
                        <small>{getBrand(l.product.brand).name}</small>
                        <Link to={`/product/${l.product.slug}`}>{l.product.name}</Link>
                        {l.color && COLORS[l.color] && <span className={s.variant}><i style={{ background: COLORS[l.color].hex }} />{COLORS[l.color].label}</span>}
                        {bad ? (
                          <span className={s.warn}>{bad.code === 'low_stock' ? `Only ${bad.max} left` : bad.code === 'sold_out' ? 'Sold out' : 'No longer available'}
                            {bad.code === 'low_stock' && bad.max > 0 ? <button type="button" className={s.fixBtn} onClick={() => setQty(l.key, bad.max)}>Change to {bad.max}</button> : <button type="button" className={s.fixBtn} onClick={() => removeLine(l.key)}>Remove</button>}
                          </span>
                        ) : <span className={l.product.stock === 'out' ? s.warn : s.ok}>{l.product.stock === 'out' ? 'Currently out of stock' : l.product.stock === 'low' ? `Only ${l.product.stockCount} left` : 'In stock'}</span>}
                      </div>
                      <QtyStepper value={l.qty} max={bad?.code === 'low_stock' ? Math.max(1, bad.max) : live?.max || 10} onChange={(q) => setQty(l.key, q)} label={l.product.name} />
                      <div className={s.price}><b>{money(l.qty * unit)}</b>{l.qty > 1 && <small>{money(unit)} each</small>}</div>
                      <button type="button" className={s.rm} aria-label={`Remove ${l.product.name}`} onClick={() => remove(l)}><TrashIcon size={18} /></button>
                    </li>
                  );
                })}
              </ul>
              <div className={s.foot}><Link to="/shop" className="link">← Continue shopping</Link><button type="button" onClick={clear}>Clear cart</button></div>
            </div>
            <OrderSummary quote={quote} checking={checking}>
              {blocked && <p className={s.blocked} role="alert">Fix the highlighted items to continue.</p>}
              <Link to="/checkout" className={`btn btn--primary btn--lg btn--block ${blocked ? s.disabledLink : ''}`} aria-disabled={blocked || undefined} onClick={(e) => { if (blocked) e.preventDefault(); }}>Proceed to checkout <ArrowRight size={17} /></Link>
            </OrderSummary>
          </div>
        )}
        {suggestions.length > 0 && (
          <section className={s.more}>
            <div className="section-head"><div><p className="eyebrow">Add-ons</p><h2>Popular under $30</h2></div><Link to="/shop?price=0-30" className="link">See all <ArrowRight size={15} /></Link></div>
            <ProductGrid products={suggestions} cols={4} />
          </section>
        )}
      </div>
    </>
  );
}
