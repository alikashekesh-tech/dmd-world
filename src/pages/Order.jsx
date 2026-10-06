import { useEffect, useState } from 'react';
import { Link, useParams } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { ProductImage } from '../components/art/Media.jsx';
import PixelText from '../components/ui/PixelText.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { ArrowRight, CheckIcon, PhoneIcon } from '../components/common/icons.jsx';
import { storeApi, guestOrders, ORDER_STATUS } from '../lib/storeApi.js';
import { LARAVEL } from '../lib/backend.js';
import { orders } from '../lib/orders.js';
import { usePageMeta } from '../lib/meta.js';
import { getProduct, money } from '../data/index.js';
import { CONTACT } from '../data/dmdMenu.js';
import NotFound from './NotFound.jsx';
import s from './Order.module.css';

const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Where the order is: placed → confirmed → completed (or the stop it ended on). */
function Timeline({ o }) {
  const st = ORDER_STATUS[o.status] || { step: 1 };
  if (st.step < 0) return <p className={s.stopped}>{st.label}{st.hint ? ` · ${st.hint}` : ''}</p>;
  const steps = [['Placed', when(o.date)], ['Confirmed by DMD', null], [o.method?.startsWith('Pick') ? 'Collected' : 'Delivered', null]];
  return (
    <ol className={s.timeline} aria-label="Order progress">
      {steps.map(([label, at], i) => {
        const done = i < st.step || (i === 2 && st.step === 3);
        const now = i === st.step && st.step < 3;
        return (
          <li key={label} className={done ? s.tDone : now ? s.tNow : ''} aria-current={now ? 'step' : undefined}>
            <span>{done ? <CheckIcon size={13} /> : i + 1}</span>
            <b>{label}</b>
            {at && <small>{at}</small>}
            {now && <small>{st.hint}</small>}
          </li>
        );
      })}
    </ol>
  );
}

/* The finish line of checkout: the arcade "level complete" moment, then the plain facts of the order,
   read from the store. Buyers see their own orders; a guest sees theirs with the private key from checkout. */
export default function Order() {
  usePageMeta({ title: 'Your order', noindex: true });
  const { id } = useParams();
  const { buyer, checking, updateOrder, setToast } = useStore();
  const [o, setO] = useState(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const key = guestOrders.keyFor(id);
  const load = () => {
    setO(null); setMissing(false); setFailed('');
    const byKey = () => (LARAVEL ? orders.get(id, key) : storeApi.get(`/orders/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`));
    const mine = () => (LARAVEL ? orders.get(id) : storeApi.get(`/me/orders/${encodeURIComponent(id)}`));
    const req = buyer ? mine().catch((e) => (key && e.status === 404 ? byKey() : Promise.reject(e))) : key ? byKey() : Promise.reject(Object.assign(new Error('missing'), { status: 404 }));
    req.then(setO).catch((e) => (e.status === 404 ? setMissing(true) : setFailed(e.message)));
  };
  useEffect(() => { if (!checking) load(); }, [id, buyer, checking]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <NotFound />;
  if (failed) return (
    <div className="container" style={{ paddingBlock: '80px' }}>
      <p role="alert" style={{ color: 'var(--deal)' }}>{failed}</p>
      <button type="button" className="btn btn--secondary" onClick={load}>Try again</button>
    </div>
  );
  if (!o) return <div className="container" style={{ paddingBlock: '80px' }}><p role="status" style={{ color: 'var(--muted)' }}>Loading your order…</p></div>;
  const items = o.items.reduce((a, i) => a + i.qty, 0);
  const st = ORDER_STATUS[o.status] || { label: o.status, hint: '' };
  const fresh = Date.now() - new Date(o.date).getTime() < 30 * 60e3 && o.status === 'pending';
  const subtotal = o.items.reduce((a, i) => a + Number(i.subtotal ?? i.total), 0);
  const where = [o.address.address_1, o.address.address_2, o.address.city].filter(Boolean).join(', ');
  const cancel = async () => {
    setCancelling(true);
    try {
      const next = LARAVEL
        ? await orders.cancel(o.id, { token: key, reason: reason.trim() })
        : await storeApi.post(`/orders/${o.id}/cancel`, { key: key || undefined, reason: reason.trim() || undefined });
      setO((x) => ({ ...x, ...next })); updateOrder(next); setConfirmCancel(false);
      setToast(`Order #${o.number} cancelled`);
    } catch (e) { setToast(e.message); if (e.code === 'not_cancellable' || e.code === 'NOT_CANCELLABLE') load(); }
    setCancelling(false);
  };
  return (
    <>
      <section className={s.stage} aria-labelledby="order-title">
        <div className={`container ${s.stageIn}`}>
          <div className={s.trophy} aria-hidden="true"><LineArt type="trophy" /></div>
          <h1 id="order-title" className={s.word}>
            <span className="sr-only">{fresh ? 'Level complete. Your order is in.' : `Order ${o.number}`}</span>
            <PixelText text={fresh ? 'LEVEL' : 'ORDER'} className={s.px} cellClass={s.on} />
            <PixelText text={fresh ? 'COMPLETE' : String(o.number).replace(/[^0-9A-Z]/gi, '').toUpperCase()} className={s.px} cellClass={s.on} />
          </h1>
          <p className={s.lead}>
            Order <b>#{o.number}</b> {fresh ? 'is in' : `· ${st.label}`}. {fresh && o.contact.phone ? <>DMD World will call <b>{o.contact.phone}</b> to confirm it.</> : st.hint}
          </p>
          <Timeline o={o} />
        </div>
      </section>

      <div className={`container ${s.body}`}>
        <div className={s.card}>
          <p className={s.hud}>Your order <span>{items} {items === 1 ? 'item' : 'items'} · {st.label}</span></p>
          <ul className={s.items}>
            {o.items.map((i) => {
              const p = getProduct(String(i.productId));
              return (
                <li key={`${i.productId}-${i.name}`}>
                  <span className={s.th}>{p ? <ProductImage product={p} /> : i.image ? <img src={i.image} alt="" referrerPolicy="no-referrer" /> : null}</span>
                  <span><small>Qty {i.qty}</small>{p ? <Link to={`/product/${p.slug}`}>{i.name}</Link> : <b>{i.name}</b>}</span>
                  <b>{money(Number(i.subtotal ?? i.total))}</b>
                </li>
              );
            })}
          </ul>
          <div className={s.total}><span>Items</span><b>{money(subtotal)}</b></div>
          {Number(o.discount) > 0 && <div className={`${s.total} ${s.discount}`}><span>Discount{o.coupons?.length ? ` · ${o.coupons.join(', ')}` : ''}</span><b>−{money(Number(o.discount))}</b></div>}
          <div className={s.total}><span>{o.method || 'Delivery'}</span><b>{Number(o.shipping) > 0 ? money(Number(o.shipping)) : o.method?.startsWith('Pick') ? 'Free' : 'Confirmed by DMD'}</b></div>
          <div className={`${s.total} ${s.grand}`}><span>Total · {o.payment}</span><b>{money(Number(o.total))}</b></div>
          {(where || o.note) && (
            <dl className={s.facts}>
              {where && <div><dt>Deliver to</dt><dd>{where}</dd></div>}
              {o.note && <div><dt>Your message</dt><dd>{o.note}</dd></div>}
            </dl>
          )}
          {o.updates?.length > 0 && (
            <div className={s.updates}>
              <p className={s.hud}>Updates from DMD</p>
              <ul>{o.updates.map((u) => <li key={u.at}><small>{when(u.at)}</small>{u.text}</li>)}</ul>
            </div>
          )}
          {o.cancellable && (
            <div className={s.cancel}>
              {!confirmCancel ? (
                <button type="button" className={s.cancelLink} onClick={() => setConfirmCancel(true)}>Cancel this order</button>
              ) : (
                <div className={s.cancelBox} role="group" aria-label="Cancel order">
                  <p><b>Cancel order #{o.number}?</b> DMD hasn’t confirmed it yet, so nothing has been charged or sent.</p>
                  <label htmlFor="cancel-reason" className="sr-only">Reason (optional)</label>
                  <input id="cancel-reason" className="input" placeholder="Reason (optional)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className={s.cancelBtns}>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Keep my order</button>
                    <button type="button" className={`btn btn--sm ${s.danger}`} onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Yes, cancel it'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={s.cta}>
          <Link to="/shop" className="btn btn--primary btn--lg">Keep playing <ArrowRight size={17} /></Link>
          {buyer ? <Link to={`/account?tab=messages&order=${o.id}`} className="btn btn--secondary btn--lg">Message DMD</Link>
            : <a href={`tel:${CONTACT.tel}`} className="btn btn--secondary btn--lg"><PhoneIcon size={17} />Call DMD</a>}
        </div>
        {!buyer && <p className={s.guestNote}>This page stays available on this device for 30 days. <Link to="/account" className="link">Create an account</Link> to keep every order in one place.</p>}
      </div>
    </>
  );
}
