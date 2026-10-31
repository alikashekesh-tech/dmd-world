import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { money, num } from '../lib/format.js';
import { nameOf, addressLines } from './Orders.jsx';
import '../styles/invoice.css';

/* An order's invoice, on its own page (no admin menus) sized for A4, opened from the order in a new tab. "Print"
   uses the browser's print dialog, which can also save it as a PDF. Everything comes from the order as saved: the
   prices the customer paid, the delivery price and any coupon. */

// The shop in Saida (the same address as the shop's About and Contact pages).
const STORE_ADDRESS = 'Illiya Intersection, Jad Center, next to Morjen Pharmacy, Saida, Lebanon';
const dateOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

export default function Invoice({ params, query }) {
  const [o, setO] = useState(null);
  const [store, setStore] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.get(`/orders/${params.id}`).then((r) => setO(r.data)).catch(setErr);
    api.get('/settings').then((r) => setStore(r.data)).catch(() => setStore({}));
  }, [params.id]);
  useEffect(() => { if (o) document.title = `Invoice #${o.number} · DMD World`; }, [o]);
  // ?print=1 opens the print dialog as soon as it's ready.
  useEffect(() => { if (o && store && query?.get('print') === '1') setTimeout(() => window.print(), 300); }, [o, store, query]);

  if (err) return <div className="invoice-page"><p className="invoice-error">{err.message}</p></div>;
  if (!o || !store) return <div className="invoice-page"><p className="invoice-loading">Preparing the invoice…</p></div>;

  const to = addressLines(o).slice(1); // the name is shown on its own line
  const units = o.items.reduce((a, l) => a + l.quantity, 0);
  const paid = o.payment_status === 'paid';
  const cancelled = o.status === 'cancelled';

  return (
    <div className="invoice-page">
      <div className="invoice-tools">
        <a className="btn sm quiet" href={`#/orders/${o.id}`}>← Back to the order</a>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 12.5 }}>A4 · Print, or choose “Save as PDF” in the print dialog</span>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print invoice</button>
      </div>

      <article className="invoice" aria-label={`Invoice for order ${o.number}`}>
        <header className="inv-head">
          <div>
            <img src="/images/dmd-world-logo.png" alt="DMD World" width="297" height="107" className="inv-logo" />
            <p className="inv-store">
              {store.store_name || 'DMD World'}<br />{STORE_ADDRESS}<br />
              {store.contact_phone || '+961 70 903 900'} · {(store.contact_email || 'info@dmdworld.store').toLowerCase()}<br />dmdworld.store
            </p>
          </div>
          <div className="inv-title">
            <h1>Invoice</h1>
            <dl>
              <dt>Invoice no.</dt><dd>#{o.number}</dd>
              <dt>Date</dt><dd>{dateOf(o.placed_at)}</dd>
              <dt>Payment</dt><dd>{o.payment_method_label}</dd>
              <dt>Status</dt><dd className={cancelled ? 'inv-void' : paid ? 'inv-paid' : ''}>{cancelled ? 'Cancelled' : paid ? 'Paid' : 'Not paid yet'}</dd>
            </dl>
          </div>
        </header>

        <section className="inv-parties">
          <div>
            <h2>Bill to</h2>
            <p><b>{nameOf(o)}</b><br />{o.contact.phone}{o.contact.email && <><br />{o.contact.email}</>}</p>
          </div>
          <div>
            <h2>{o.delivery_method === 'pickup' ? 'Pickup' : 'Deliver to'}</h2>
            <p>{o.delivery_method === 'pickup' ? <>Collected from the store<br />{STORE_ADDRESS}</> : to.length ? to.map((l) => <span key={l}>{l}<br /></span>) : '—'}</p>
          </div>
        </section>

        <table className="inv-items">
          <thead><tr><th>#</th><th>Item</th><th className="r">Unit price</th><th className="r">Qty</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {o.items.map((l, i) => (
              <tr key={`${l.product_id}-${i}`}>
                <td className="muted">{i + 1}</td>
                <td><b>{l.name}</b>{l.options?.length > 0 && <small>{l.options.map((x) => `${x.name}: ${x.value}`).join(' · ')}</small>}{l.sku && <small>SKU {l.sku}</small>}</td>
                <td className="r">{money(l.unit_price)}</td>
                <td className="r">{num(l.quantity)}</td>
                <td className="r">{money(l.line_subtotal ?? l.unit_price * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-bottom">
          <div className="inv-notes">
            {o.customer_note && <p><b>Customer note:</b> {o.customer_note}</p>}
            <p>{num(units)} item{units === 1 ? '' : 's'}. Prices in US dollars.</p>
            {cancelled && <p className="inv-void"><b>This order was cancelled.</b>{o.cancel_reason ? ` ${o.cancel_reason}` : ''}</p>}
          </div>
          <dl className="inv-totals">
            <dt>Subtotal</dt><dd>{money(o.subtotal)}</dd>
            {o.discount_total > 0 && <><dt>Discount{o.coupon_code ? ` (${o.coupon_code})` : ''}</dt><dd>−{money(o.discount_total)}</dd></>}
            <dt>{o.delivery_method_label}</dt><dd>{o.shipping_total > 0 ? money(o.shipping_total) : o.delivery_method === 'pickup' ? 'Free' : money(0)}</dd>
            <dt className="inv-grand">Total</dt><dd className="inv-grand">{money(o.total)}</dd>
          </dl>
        </div>

        <footer className="inv-foot">Thank you for shopping at DMD World. Questions about this order? Call or WhatsApp {store.contact_phone || '+961 70 903 900'} and mention invoice #{o.number}.</footer>
      </article>
    </div>
  );
}
