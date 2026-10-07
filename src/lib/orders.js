/* Cart, checkout and order calls to the Laravel API. The browser only says what to buy and
   where to send it: every price, stock check and total comes back from the server. Laravel's answers are mapped to the
   shapes the cart, checkout, order and account pages already use. */
import { laravelApi } from './laravelApi.js';

const CODES = { SOLD_OUT: 'sold_out', LOW_STOCK: 'low_stock', TOO_LARGE: 'too_large', UNAVAILABLE: 'unavailable' };
// Laravel's field names → the checkout form's field ids (so the first wrong field gets the focus).
const FIELDS = { 'contact.first_name': 'firstName', 'contact.last_name': 'lastName', 'contact.email': 'email', 'contact.phone': 'phone', 'address.street': 'address_1', 'address.city': 'city', address: 'address_1', address_id: 'address_1', coupon: 'coupon' };

/** Laravel's order → the storefront's order. */
export const orderFromApi = (o) => ({
  id: o.id, number: o.number, status: o.status === 'on_hold' ? 'on-hold' : o.status, date: o.placed_at,
  total: o.total, subtotal: o.subtotal, shipping: o.shipping_total, discount: o.discount_total, coupons: o.coupon_code ? [o.coupon_code] : [],
  payment: o.payment_method_label, method: o.delivery_method_label, note: o.customer_note || '',
  contact: { name: `${o.contact.first_name} ${o.contact.last_name}`.trim(), email: o.contact.email, phone: o.contact.phone },
  address: o.address
    ? { address_1: o.address.street || '', address_2: [o.address.building && `Building ${o.address.building}`, o.address.floor && `Floor ${o.address.floor}`].filter(Boolean).join(', '), city: [o.address.area, o.address.city].filter(Boolean).join(', ') }
    : { address_1: '', address_2: '', city: '' },
  items: o.items.map((i) => ({ productId: i.product_id, name: i.name, qty: i.quantity, total: i.line_total, subtotal: i.line_subtotal, image: i.image_url })),
  updates: [], cancellable: !!o.cancellable,
});

const rethrowFields = (e) => {
  if (e.fields) e.fields = Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [FIELDS[k] || k, v]));
  throw e;
};

export const orders = {
  /** The live price check for the cart (and an optional code): same shape as the legacy quote. */
  async quote(items, coupon, email) {
    const { data } = await laravelApi.post('/cart/quote', { items: items.map((l) => ({ product_id: l.id, quantity: l.qty })), coupon: coupon || undefined, email: email || undefined });
    return {
      lines: data.lines.map((l) => ({ id: l.product_id, qty: l.quantity, name: l.name, price: l.unit_price, regular: l.regular_price, problem: l.problem, code: CODES[l.code] || null, max: l.max_quantity })),
      subtotal: data.subtotal, discount: data.discount, total: data.total, ok: data.ok,
      coupon: data.coupon ? { code: data.coupon.code, ok: data.coupon.ok, discount: data.coupon.discount, label: data.coupon.label, message: data.coupon.message } : null,
    };
  },
  async options() {
    const { data } = await laravelApi.get('/checkout/options');
    return { payments: data.payment_methods, coupons: data.coupons_enabled };
  },
  /** Places the order; a guest gets back the private token that opens it later. */
  async place({ idempotencyKey, items, contact, method, payment, note, address, addressId, saveAddress, coupon }) {
    const body = {
      idempotency_key: idempotencyKey,
      items: items.map((l) => ({ product_id: Number(l.id), quantity: l.qty })),
      contact: { first_name: contact.firstName, last_name: contact.lastName, email: contact.email, phone: contact.phone },
      delivery_method: method, payment_method: payment, note: note || null, coupon: coupon || null,
      ...(method === 'delivery' ? (addressId ? { address_id: addressId } : { address: { street: address.address_1, building: address.address_2 || null, city: address.city, country: 'LB' }, save_address: !!saveAddress }) : {}),
    };
    const r = await laravelApi.post('/orders', body, { timeout: 45000 }).catch(rethrowFields);
    return { id: r.data.id, number: r.data.number, key: r.meta.guest_token, total: r.data.total };
  },
  async list(page = 1) {
    const r = await laravelApi.get(`/orders?page=${page}`);
    return { items: r.data.map(orderFromApi), pages: r.meta.last_page || 1 };
  },
  get: async (id, token) => orderFromApi((await laravelApi.get(`/orders/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`)).data),
  cancel: async (id, { token, reason } = {}) => orderFromApi((await laravelApi.post(`/orders/${encodeURIComponent(id)}/cancel`, { token: token || undefined, reason: reason || undefined })).data),
};
