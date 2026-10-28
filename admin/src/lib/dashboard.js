/* Laravel's /admin/dashboard (snake_case, every figure computed from MySQL) → the shape the dashboard panels draw. */

const LINK = { order: (id) => `#/orders/${id}`, product: (id) => `#/products/${id}`, conversation: (id) => `#/messages/${id}`, user: (id) => `#/customers/${id}`, review: () => '#/reviews', coupon: () => '#/offers?tab=coupons', offer: () => '#/offers', category: () => '#/categories', brand: () => '#/brands', banner: () => '#/homepage' };
/** Where an activity line leads (its subject), if anywhere. */
export const activityLink = (a) => (a.subject && LINK[a.subject.type] ? LINK[a.subject.type](a.subject.id) : null);

const stockRow = (p) => ({ id: p.id, name: p.name, image: p.image, manage_stock: p.stock_quantity != null, stock_quantity: p.stock_quantity });

export function dashboardFromApi(d) {
  const k = d.kpis;
  const a = d.attention;
  const o = d.offers;
  return {
    range: d.range, generatedAt: d.generated_at, buckets: d.buckets,
    kpis: { revenue: k.revenue, prevRevenue: k.prev_revenue, orders: k.orders, prevOrders: k.prev_orders, aov: k.aov, prevAov: k.prev_aov, items: k.items, prevItems: k.prev_items, newBuyers: k.new_buyers, prevNewBuyers: k.prev_new_buyers },
    series: d.series,
    target: { value: d.target.value, custom: d.target.value != null, today: d.target.today, todayOrders: d.target.today_orders },
    totals: d.totals,
    status: { ...d.status, onHold: d.status.on_hold },
    attention: {
      pending: a.pending, onHold: a.on_hold, outOfStock: a.out_of_stock, lowStock: a.low_stock,
      reviews: a.reviews, messages: a.messages, ending: a.ending, stockAlerts: a.stock_alerts,
    },
    recentOrders: d.recent_orders,
    lowStock: d.low_stock.map(stockRow),
    outOfStock: d.out_of_stock.map(stockRow),
    offers: {
      onSale: o.on_sale, coupons: o.coupons, campaigns: o.offers, list: o.list,
      coupon: o.live_coupons.map((c) => ({ id: c.id, code: c.code, label: c.label, usage_count: c.uses, date_expires: c.expires_at })),
    },
    topProducts: d.top_products,
    categories: d.categories,
    brands: d.brands,
    recentCustomers: d.recent_customers.map((c) => ({ ...c, date_created: c.created_at })),
    recentReviews: d.recent_reviews.map((r) => ({
      id: r.id, product_id: r.product_id, product_name: r.product_name, reviewer: r.author, rating: r.rating,
      review: [r.title, r.body].filter(Boolean).join(' · '), status: r.status, date_created: r.created_at,
    })),
    activity: d.activity.map((x) => ({ ...x, ref: activityLink(x) })),
  };
}
