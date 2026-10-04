/* In-memory mirrors of the store, refreshed incrementally (modified_after), so search, stock alerts and the
   dashboard don't pull thousands of records from WooCommerce on every request. Writes made through the admin
   update the mirrors immediately. */
const PRODUCT_FIELDS = 'id,name,sku,status,type,catalog_visibility,purchasable,price,regular_price,sale_price,on_sale,date_on_sale_from,date_on_sale_to,stock_quantity,stock_status,manage_stock,low_stock_amount,categories,images,featured,total_sales,date_created,date_modified,date_modified_gmt,permalink,average_rating,rating_count';
const ORDER_FIELDS = 'id,number,status,currency,date_created,date_modified,total,shipping_total,discount_total,customer_id,customer_note,billing,line_items,payment_method_title';
const DAY = 864e5;
const isoGmt = (t) => new Date(t).toISOString().slice(0, 19);
const localDay = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

export const slimProduct = (p) => ({
  id: p.id, name: p.name, sku: p.sku || '', status: p.status, type: p.type, catalog_visibility: p.catalog_visibility || 'visible', purchasable: p.purchasable !== false, price: p.price, regular_price: p.regular_price, sale_price: p.sale_price,
  on_sale: p.on_sale, date_on_sale_from: p.date_on_sale_from, date_on_sale_to: p.date_on_sale_to, stock_quantity: p.stock_quantity,
  stock_status: p.stock_status, manage_stock: p.manage_stock, low_stock_amount: p.low_stock_amount, featured: p.featured, total_sales: p.total_sales,
  categories: (p.categories || []).map((c) => ({ id: c.id, name: c.name })), image: p.images?.[0]?.src || null, images: (p.images || []).slice(0, 8).map((i) => i.src).filter(Boolean), date_created: p.date_created,
  date_modified: p.date_modified, permalink: p.permalink, average_rating: p.average_rating ?? '0.00', rating_count: p.rating_count ?? 0,
});
const slimOrder = (o) => ({
  id: o.id, number: o.number, status: o.status, currency: o.currency, date_created: o.date_created, date_modified: o.date_modified, total: o.total,
  shipping_total: o.shipping_total, discount_total: o.discount_total, customer_id: o.customer_id, customer_note: o.customer_note || '',
  billing: { first_name: o.billing?.first_name, last_name: o.billing?.last_name, email: o.billing?.email, phone: o.billing?.phone, city: o.billing?.city },
  items: (o.line_items || []).map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity, total: l.total, image: l.image?.src || null })),
  payment: o.payment_method_title,
});

export function createIndexes(woo) {
  const products = { map: new Map(), syncedAt: 0, fullAt: 0, cursor: null, loading: null };
  const orders = { map: new Map(), syncedAt: 0, fullAt: 0, cursor: null, loading: null };
  const cats = { list: [], at: 0, loading: null };
  const settings = { lowStock: 2, noStock: 0, at: 0 };

  async function syncProducts(force = false) {
    const t = Date.now();
    if (!force && t - products.syncedAt < 45e3) return;
    if (products.loading) return products.loading;
    products.loading = (async () => {
      const full = !products.fullAt || t - products.fullAt > 30 * 60e3;
      const started = Date.now();
      const changed = full
        ? await woo.all('/products', { status: 'any', _fields: PRODUCT_FIELDS, orderby: 'id', order: 'asc' }, 80)
        : await woo.all('/products', { status: 'any', _fields: PRODUCT_FIELDS, modified_after: products.cursor, dates_are_gmt: true }, 20);
      const trash = await woo.all('/products', { status: 'trash', _fields: PRODUCT_FIELDS }, 10);
      if (full) products.map = new Map();
      for (const p of [...changed, ...trash]) products.map.set(p.id, slimProduct(p));
      // Anything we still think is in the trash but WooCommerce no longer lists there was restored or deleted elsewhere.
      if (!full) for (const p of products.map.values()) if (p.status === 'trash' && !trash.some((x) => x.id === p.id)) products.map.delete(p.id);
      products.cursor = isoGmt(started - 5000);
      products.syncedAt = Date.now();
      if (full) products.fullAt = products.syncedAt;
    })().finally(() => { products.loading = null; });
    return products.loading;
  }

  async function syncOrders(force = false) {
    const t = Date.now();
    if (!force && t - orders.syncedAt < 30e3) return;
    if (orders.loading) return orders.loading;
    orders.loading = (async () => {
      const full = !orders.fullAt || t - orders.fullAt > 30 * 60e3;
      const started = Date.now();
      const changed = full
        ? await woo.all('/orders', { status: 'any', after: localDay(t - 190 * DAY), _fields: ORDER_FIELDS }, 60)
        : await woo.all('/orders', { status: 'any', modified_after: orders.cursor, dates_are_gmt: true, _fields: ORDER_FIELDS }, 20);
      const trash = await woo.all('/orders', { status: 'trash', _fields: ORDER_FIELDS }, 5);
      if (full) orders.map = new Map();
      for (const o of [...changed, ...trash]) orders.map.set(o.id, slimOrder(o));
      orders.cursor = isoGmt(started - 5000);
      orders.syncedAt = Date.now();
      if (full) orders.fullAt = orders.syncedAt;
    })().finally(() => { orders.loading = null; });
    return orders.loading;
  }

  async function categories(force = false) {
    if (!force && cats.list.length && Date.now() - cats.at < 5 * 60e3) return cats.list;
    if (cats.loading) return cats.loading;
    cats.loading = woo.all('/products/categories', { orderby: 'name', order: 'asc' }, 20)
      .then((list) => { cats.list = list; cats.at = Date.now(); return list; })
      .finally(() => { cats.loading = null; });
    return cats.loading;
  }

  async function stockThresholds() {
    if (Date.now() - settings.at < 5 * 60e3) return settings;
    try {
      const { data } = await woo.get('/settings/products');
      const v = (id, d) => Number(data.find((s) => s.id === id)?.value ?? d);
      settings.lowStock = v('woocommerce_notify_low_stock_amount', 2);
      settings.noStock = v('woocommerce_notify_no_stock_amount', 0);
    } catch { /* keep defaults */ }
    settings.at = Date.now();
    return settings;
  }

  return {
    syncProducts, syncOrders, categories, stockThresholds,
    products: () => [...products.map.values()],
    product: (id) => products.map.get(Number(id)),
    putProduct: (p) => products.map.set(p.id, slimProduct(p)),
    dropProduct: (id) => products.map.delete(Number(id)),
    orders: () => [...orders.map.values()],
    putOrder: (o) => orders.map.set(o.id, slimOrder(o)),
    dropOrder: (id) => orders.map.delete(Number(id)),
    invalidateCategories: () => { cats.at = 0; },
    status: () => ({ products: products.map.size, productsSyncedAt: products.syncedAt, orders: orders.map.size, ordersSyncedAt: orders.syncedAt }),
  };
}

/* A product is low on stock when it tracks stock and sits at or under its own threshold (or the store's). */
export function stockLevel(p, thresholds) {
  if (p.stock_status === 'outofstock') return 'out';
  if (!p.manage_stock || p.stock_quantity == null) return 'untracked';
  const low = p.low_stock_amount ?? thresholds.lowStock;
  if (p.stock_quantity <= thresholds.noStock) return 'out';
  if (p.stock_quantity <= low) return 'low';
  return 'ok';
}
