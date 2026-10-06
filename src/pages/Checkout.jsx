import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { OrderSummary } from './Cart.jsx';
import { LockIcon, CheckIcon, ArrowRight, CloseIcon } from '../components/common/icons.jsx';
import { account } from '../lib/account.js';
import { orders } from '../lib/orders.js';
import { usePageMeta } from '../lib/meta.js';
import { useQuote } from '../lib/useQuote.js';
import { money } from '../data/index.js';
import s from './Checkout.module.css';

/* Checkout as three levels: the cart is already cleared, you're on details, the order screen is the finish. */
function Levels({ at }) {
  const steps = ['Cart', 'Details', 'Done'];
  return (
    <ol className={s.levels} aria-label="Checkout progress">
      {steps.map((l, i) => (
        <li key={l} className={i < at ? s.done : i === at ? s.now : ''} aria-current={i === at ? 'step' : undefined}>
          <span>{i < at ? <CheckIcon size={13} /> : `0${i + 1}`}</span>{l}
        </li>
      ))}
    </ol>
  );
}

const METHODS = [
  { id: 'delivery', label: 'Delivery', note: 'Cost and timing confirmed by DMD after you order', tag: 'TBC' },
  { id: 'pickup', label: 'Pick up', note: 'Collect from the store', tag: 'Free' },
];
const FALLBACK_PAYMENTS = [{ id: 'cod', title: 'Cash on delivery', description: 'Pay when your order arrives.' }];
const DRAFT = 'dmd:checkout-draft';
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT)) || {}; } catch { return {}; } };

function Field({ label, name, type = 'text', value, onChange, error, auto, wide, optional, ...rest }) {
  return (
    <div className={`field ${wide ? s.wide : ''}`}>
      <label htmlFor={name}>{label}{optional && <span className={s.opt}> optional</span>}</label>
      <input id={name} name={name} type={type} className="input" value={value} onChange={onChange} autoComplete={auto} aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined} {...rest} />
      {error && <span className={s.err} id={`${name}-err`}>{error}</span>}
    </div>
  );
}

export default function Checkout() {
  usePageMeta({ title: 'Checkout', noindex: true });
  const { lines, buyer, placeOrder, setQty, removeLine } = useStore();
  const nav = useNavigate();
  const addr = buyer?.shipping?.address_1 ? buyer.shipping : buyer?.billing || {};
  const draft = readDraft();
  const [f, setF] = useState(() => ({
    firstName: buyer?.firstName || draft.firstName || '', lastName: buyer?.lastName || draft.lastName || '', email: buyer?.email || draft.email || '', phone: buyer?.phone || draft.phone || '',
    address_1: addr.address_1 || draft.address_1 || '', address_2: addr.address_2 || draft.address_2 || '', city: addr.city || draft.city || '', note: draft.note || '',
  }));
  const [method, setMethod] = useState(draft.method === 'pickup' ? 'pickup' : 'delivery');
  const [payments, setPayments] = useState(null);
  const [couponsOn, setCouponsOn] = useState(false);
  const [payment, setPayment] = useState('cod');
  const [saveAddress, setSaveAddress] = useState(!addr.address_1);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const attempt = useRef(newKey()); // one key per checkout: a retried submit can't create a second order
  // Laravel: a signed-in buyer delivers to one of their saved addresses (the default is preselected) or a new one.
  const [saved, setSaved] = useState([]);
  const [addressId, setAddressId] = useState('new');
  const [quote, checking] = useQuote(lines, coupon, f.email);

  const set = (e) => { setF((x) => ({ ...x, [e.target.name]: e.target.value })); setErrors((x) => ({ ...x, [e.target.name]: undefined })); };
  // A refresh or a trip back to the cart doesn't wipe what was typed (kept for this tab only, never the account).
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...f, method })); } catch { /* storage unavailable */ } }, [f, method]);
  // The session may finish loading after this page opens: fill in the buyer's saved details then.
  useEffect(() => {
    if (!buyer) return;
    const a = buyer.shipping?.address_1 ? buyer.shipping : buyer.billing || {};
    setF((x) => ({ ...x, firstName: x.firstName || buyer.firstName, lastName: x.lastName || buyer.lastName, email: x.email || buyer.email, phone: x.phone || buyer.phone, address_1: x.address_1 || a.address_1 || '', address_2: x.address_2 || a.address_2 || '', city: x.city || a.city || '' }));
    setSaveAddress(!a.address_1);
  }, [buyer]);
  useEffect(() => {
    if (!buyer) { setSaved([]); setAddressId('new'); return; }
    account.addresses.list().then((list) => { setSaved(list); setAddressId(list.find((a) => a.isDefault)?.id ?? 'new'); }).catch(() => setSaved([]));
  }, [buyer]);
  useEffect(() => {
    orders.options()
      .then((r) => { setPayments(r.payments); setPayment(r.payments[0]?.id || 'cod'); setCouponsOn(r.coupons !== false); })
      .catch(() => setPayments(FALLBACK_PAYMENTS));
  }, []);

  if (lines.length === 0) return (
    <>
      <PageHero crumbs={[{ label: 'Home', to: '/' }, { label: 'Checkout' }]} eyebrow="Level 1 · Cart" title="Checkout" art={<LineArt type="receipt" />}><Levels at={0} /></PageHero>
      <div className="container" style={{ paddingBlock: '32px 80px' }}>
        <EmptyState art={<LineArt type="bag" />} status="Inventory: 0" title="Nothing to check out yet" text="Add something to your cart first, then come back here.">
          <Link to="/shop" className="btn btn--primary btn--lg">Shop gaming gear <ArrowRight size={17} /></Link>
        </EmptyState>
      </div>
    </>
  );

  const stale = quote?.lines.filter((q) => q.problem) || [];
  const total = quote ? quote.total : lines.reduce((a, l) => a + l.qty * l.product.price, 0);
  const applyCoupon = (e) => { e.preventDefault(); const c = codeInput.trim(); if (c) setCoupon(c); };
  const dropCoupon = () => { setCoupon(''); setCodeInput(''); };
  const fix = (q) => {
    const line = lines.find((l) => Number(l.id) === q.id);
    if (!line) return;
    if (q.code === 'low_stock' && q.max > 0) setQty(line.key, q.max); else removeLine(line.key);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const er = {};
    if (!f.firstName.trim()) er.firstName = 'Enter your first name';
    if (!f.lastName.trim()) er.lastName = 'Enter your last name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) er.email = 'Enter a valid email address';
    if (!/^[+\d][\d\s().-]{5,}$/.test(f.phone.trim())) er.phone = 'Enter a phone number DMD can call';
    const typed = method === 'delivery' && addressId === 'new';
    if (typed && f.address_1.trim().length < 4) er.address_1 = 'Enter your street address';
    if (typed && !f.city.trim()) er.city = 'Enter your city';
    setErrors(er); setProblem('');
    if (Object.keys(er).length) { document.getElementById(Object.keys(er)[0])?.focus(); return; }
    if (stale.length) { setProblem('Some items changed since you added them. Fix them in the summary, then place your order.'); return; }
    if (coupon && quote?.coupon && !quote.coupon.ok) { setProblem(`${quote.coupon.message} Remove the code to continue.`); return; }
    setBusy(true);
    try {
      const r = await placeOrder({
        idempotencyKey: attempt.current,
        contact: { firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone },
        method, payment, note: f.note, saveAddress: !!buyer && saveAddress, coupon: coupon || undefined,
        address: { address_1: f.address_1, address_2: f.address_2, city: f.city, country: 'LB' },
        addressId: addressId !== 'new' ? addressId : undefined,
      });
      try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
      nav(`/order/${r.id}`);
    } catch (x) {
      if (x.fields) { setErrors(x.fields); document.getElementById(Object.keys(x.fields)[0])?.focus(); }
      // Anything other than a dropped connection is a definite answer: the next try is a new attempt.
      if (x.code !== 'offline') attempt.current = newKey();
      setProblem(x.code === 'offline' ? `${x.message} Your order wasn’t placed twice: trying again is safe.` : x.message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHero crumbs={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} eyebrow="Level 2 · Details" title="Checkout" lead="A few short steps. Nothing is charged online: DMD confirms your order and delivery with you." art={<LineArt type="receipt" />}>
        <Levels at={1} />
      </PageHero>
      <div className="container">
      <form className={s.layout} onSubmit={submit} noValidate>
        <div className={s.steps}>
          <section className={s.card} aria-labelledby="co-contact">
            <h2 id="co-contact"><b>01</b>Contact</h2>
            <div className={s.grid}>
              <Field label="First name" name="firstName" value={f.firstName} onChange={set} error={errors.firstName} auto="given-name" />
              <Field label="Last name" name="lastName" value={f.lastName} onChange={set} error={errors.lastName} auto="family-name" />
              <Field label="Email" name="email" type="email" value={f.email} onChange={set} error={errors.email} auto="email" inputMode="email" />
              <Field label="Phone" name="phone" type="tel" value={f.phone} onChange={set} error={errors.phone} auto="tel" placeholder="+961 …" inputMode="tel" />
              {!buyer && <p className={`${s.hint} ${s.wide}`}>Have an account? <Link to="/account?next=%2Fcheckout" className={s.a}>Sign in</Link> to use saved details and see this order in your history.</p>}
            </div>
          </section>
          <section className={s.card} aria-labelledby="co-method">
            <h2 id="co-method"><b>02</b>Delivery method</h2>
            <div className={s.methods} role="radiogroup" aria-labelledby="co-method">
              {METHODS.map((m) => (
                <label key={m.id} className={`${s.method} ${method === m.id ? s.on : ''}`}>
                  <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span><b>{m.label}</b><small>{m.note}</small></span>
                  <em>{m.tag}</em>
                </label>
              ))}
            </div>
          </section>
          {method === 'delivery' && (
            <section className={s.card} aria-labelledby="co-address">
              <h2 id="co-address"><b>03</b>Delivery address</h2>
              {saved.length > 0 && (
                <div className={s.methods} role="radiogroup" aria-labelledby="co-address">
                  {saved.map((a) => (
                    <label key={a.id} className={`${s.method} ${addressId === a.id ? s.on : ''}`}>
                      <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span><b>{a.label || 'Saved address'}</b><small>{a.summary}</small></span>
                      <em>{a.isDefault ? 'Default' : ''}</em>
                    </label>
                  ))}
                  <label className={`${s.method} ${addressId === 'new' ? s.on : ''}`}>
                    <input type="radio" name="address" checked={addressId === 'new'} onChange={() => setAddressId('new')} />
                    <span><b>A new address</b><small>Type it below</small></span>
                    <em />
                  </label>
                </div>
              )}
              {addressId === 'new' && <div className={s.grid}>
                <Field wide label="Street address" name="address_1" value={f.address_1} onChange={set} error={errors.address_1} auto="address-line1" />
                <Field label="Building, floor" name="address_2" value={f.address_2} onChange={set} auto="address-line2" optional />
                <Field label="City" name="city" value={f.city} onChange={set} error={errors.city} auto="address-level2" />
                <p className={`${s.hint} ${s.wide}`}>Delivery within Lebanon.</p>
                {buyer && <label className={`${s.check} ${s.wide}`}><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />Save this address to my account</label>}
              </div>}
            </section>
          )}
          <section className={s.card} aria-labelledby="co-pay">
            <h2 id="co-pay"><b>{method === 'delivery' ? '04' : '03'}</b>Payment</h2>
            <p className={s.demo}><LockIcon size={15} />No card details needed. You pay DMD directly when your order is confirmed.</p>
            <div className={s.methods} role="radiogroup" aria-labelledby="co-pay">
              {(payments || FALLBACK_PAYMENTS).map((p) => (
                <label key={p.id} className={`${s.method} ${payment === p.id ? s.on : ''}`}>
                  <input type="radio" name="payment" checked={payment === p.id} onChange={() => setPayment(p.id)} />
                  <span><b>{p.title}</b>{p.description && <small>{p.description}</small>}</span>
                  <em />
                </label>
              ))}
            </div>
            <div className={`field ${s.noteField}`}>
              <label htmlFor="note">Message to DMD <span className={s.opt}>optional</span></label>
              <textarea id="note" name="note" className={`input ${s.note}`} rows={3} maxLength={1000} value={f.note} onChange={set} placeholder="Delivery times, gift wrap, questions about the order…" />
            </div>
          </section>
        </div>
        <OrderSummary showItems quote={quote} checking={checking}>
          {stale.length > 0 && (
            <ul className={s.stale} role="alert">
              {stale.map((q) => (
                <li key={q.id}>
                  <span>{q.problem}</span>
                  <button type="button" className="link" onClick={() => fix(q)}>{q.code === 'low_stock' && q.max > 0 ? `Change to ${q.max}` : 'Remove'}</button>
                </li>
              ))}
            </ul>
          )}
          {couponsOn && (
            coupon && quote?.coupon?.ok ? (
              <div className={s.couponOn}>
                <span><b>{quote.coupon.code}</b> · {quote.coupon.label} applied</span>
                <button type="button" onClick={dropCoupon} aria-label={`Remove code ${quote.coupon.code}`}><CloseIcon size={14} /></button>
              </div>
            ) : (
              <div className={s.coupon}>
                <label htmlFor="coupon" className="sr-only">Discount code</label>
                <input id="coupon" className="input" placeholder="Discount code" value={codeInput} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60}
                  onChange={(e) => { setCodeInput(e.target.value); if (coupon) setCoupon(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyCoupon(e); }} aria-describedby={coupon && quote?.coupon && !quote.coupon.ok ? 'coupon-err' : undefined} />
                <button type="button" className="btn btn--secondary btn--sm" onClick={applyCoupon} disabled={!codeInput.trim() || (checking && !!coupon)}>{checking && coupon ? 'Checking…' : 'Apply'}</button>
                {coupon && quote?.coupon && !quote.coupon.ok && <p id="coupon-err" className={s.couponErr} role="alert">{quote.coupon.message}</p>}
              </div>
            )
          )}
          {problem && <p className={s.problem} role="alert">{problem}</p>}
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy || stale.length > 0}>
            {busy ? 'Placing your order…' : <>Place order · <span id="co-total">{money(total)}</span> <ArrowRight size={17} /></>}
          </button>
        </OrderSummary>
      </form>
      </div>
    </>
  );
}
