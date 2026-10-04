import { useEffect, useMemo, useRef, useState } from 'react';
import { storeApi } from './storeApi.js';

/**
 * The live price check for the cart (and an optional coupon): real prices, stock problems per line and the
 * discount, straight from WooCommerce. Debounced; only the newest answer is kept. null while unknown or offline
 * (the order itself is always checked again by the server).
 */
export function useQuote(lines, coupon = '', email = '') {
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);
  const items = useMemo(() => lines.map((l) => ({ id: Number(l.id), qty: l.qty })), [lines]);
  const key = JSON.stringify(items);
  const mail = coupon ? email : ''; // the email only matters for "once per customer" coupons
  useEffect(() => {
    const n = ++seq.current;
    if (!items.length) { setQuote(null); setChecking(false); return undefined; }
    setChecking(true);
    const t = setTimeout(() => {
      storeApi.post('/cart/quote', { items, coupon: coupon || undefined, email: mail || undefined })
        .then((q) => { if (n === seq.current) setQuote(q); })
        .catch(() => { if (n === seq.current) setQuote(null); })
        .finally(() => { if (n === seq.current) setChecking(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [key, coupon, mail]); // eslint-disable-line react-hooks/exhaustive-deps -- `items` is captured through `key`
  return [quote, checking];
}
