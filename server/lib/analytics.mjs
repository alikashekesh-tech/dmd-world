/* Dashboard maths over the order/product mirrors. Revenue follows WooCommerce: processing, completed and on-hold
   orders count; pending (unpaid), cancelled, failed and refunded do not. */
export const REVENUE = new Set(['processing', 'completed', 'on-hold']);
const NOT_ORDERS = new Set(['trash', 'checkout-draft', 'failed']);
const DAY = 864e5;
const at = (s) => new Date(s).getTime();
const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function windowFor(range, now = Date.now()) {
  if (range === 'today') { const s = sod(now); return { start: s, end: now, prevStart: s - DAY, prevEnd: now - DAY, buckets: 'hour', days: 1 }; }
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range] || 7;
  const start = sod(now) - (days - 1) * DAY;
  return { start, end: now, prevStart: start - days * DAY, prevEnd: start, buckets: 'day', days };
}

export function summarise(orders, w) {
  const inW = (o, a, b) => { const t = at(o.date_created); return t >= a && t < b + 1; };
  const cur = orders.filter((o) => !NOT_ORDERS.has(o.status) && inW(o, w.start, w.end));
  const prev = orders.filter((o) => !NOT_ORDERS.has(o.status) && inW(o, w.prevStart, w.prevEnd));
  const rev = (list) => list.filter((o) => REVENUE.has(o.status)).reduce((a, o) => a + Number(o.total), 0);
  const paid = (list) => list.filter((o) => REVENUE.has(o.status));
  const items = (list) => paid(list).reduce((a, o) => a + o.items.reduce((b, l) => b + l.quantity, 0), 0);
  const revenue = rev(cur), prevRevenue = rev(prev);
  const firstSeen = new Map();
  for (const o of [...orders].sort((a, b) => a.date_created.localeCompare(b.date_created))) {
    const k = (o.billing.email || `#${o.customer_id}`).toLowerCase();
    if (!firstSeen.has(k)) firstSeen.set(k, at(o.date_created));
  }
  const newBuyers = [...firstSeen.values()].filter((t) => t >= w.start).length;
  const prevNewBuyers = [...firstSeen.values()].filter((t) => t >= w.prevStart && t < w.prevEnd).length;

  // series
  const series = [];
  if (w.buckets === 'hour') {
    const hours = new Date(w.end).getHours() + 1;
    for (let h = 0; h < hours; h++) series.push({ t: w.start + h * 3600e3, revenue: 0, orders: 0 });
    for (const o of cur) { const h = new Date(at(o.date_created)).getHours(); const b = series[h]; if (b) { b.orders++; if (REVENUE.has(o.status)) b.revenue += Number(o.total); } }
  } else {
    for (let d = 0; d < w.days; d++) series.push({ t: w.start + d * DAY, revenue: 0, orders: 0 });
    for (const o of cur) { const i = Math.floor((sod(at(o.date_created)) - w.start) / DAY); const b = series[i]; if (b) { b.orders++; if (REVENUE.has(o.status)) b.revenue += Number(o.total); } }
  }
  const statusMix = {};
  for (const o of cur) statusMix[o.status] = (statusMix[o.status] || 0) + 1;

  return {
    revenue, prevRevenue, orders: cur.length, prevOrders: prev.length,
    paidOrders: paid(cur).length, aov: paid(cur).length ? revenue / paid(cur).length : 0,
    prevAov: paid(prev).length ? prevRevenue / paid(prev).length : 0,
    items: items(cur), prevItems: items(prev), newBuyers, prevNewBuyers, series, statusMix, current: cur,
  };
}

/* Which top-level category a product belongs to, split into "type" roots and brand roots. */
export function classifier(categories, brandIds) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const brands = new Set(brandIds);
  const root = (id) => { let c = byId.get(id); let guard = 0; while (c && c.parent && guard++ < 10) c = byId.get(c.parent) || c; return c; };
  return (product) => {
    const roots = (product?.categories || []).map((c) => root(c.id)).filter(Boolean);
    const brand = roots.find((r) => brands.has(r.id));
    const type = roots.find((r) => !brands.has(r.id) && r.slug !== 'new-offers' && r.id !== 996);
    return { brand: brand ? { id: brand.id, name: brand.name } : null, category: type ? { id: type.id, name: type.name } : brand ? { id: -1, name: 'Brand gear' } : { id: 0, name: 'Uncategorised' } };
  };
}

export function leaderboards(paidOrders, productOf, classify) {
  const prod = new Map(), cat = new Map(), brand = new Map();
  const bump = (m, key, name, units, revenue, orderId) => {
    const e = m.get(key) || { id: key, name, units: 0, revenue: 0, orders: new Set() };
    e.units += units; e.revenue += revenue; e.orders.add(orderId); m.set(key, e);
  };
  for (const o of paidOrders) {
    for (const l of o.items) {
      const revenue = Number(l.total);
      bump(prod, l.product_id, l.name, l.quantity, revenue, o.id);
      const c = classify(productOf(l.product_id));
      bump(cat, c.category.id, c.category.name, l.quantity, revenue, o.id);
      if (c.brand) bump(brand, c.brand.id, c.brand.name, l.quantity, revenue, o.id);
    }
  }
  const out = (m) => [...m.values()].map((e) => ({ ...e, orders: e.orders.size })).sort((a, b) => b.revenue - a.revenue);
  return { products: out(prod), categories: out(cat), brands: out(brand) };
}
