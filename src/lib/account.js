/* Buyer account calls for the Laravel backend (VITE_BACKEND=laravel): signing in and out, the profile, passwords, the
   address book and the wishlist. Everything is tied to the session cookie; no buyer id is ever sent. Laravel's
   snake_case answers are turned into the camelCase shapes the storefront components already use. */
import { laravelApi } from './laravelApi.js';

/** Laravel's buyer → the storefront's buyer. */
export const buyerFromApi = (u) => (u ? {
  id: u.id, email: u.email, firstName: u.first_name || '', lastName: u.last_name || '', phone: u.phone || '',
  since: u.member_since, marketing: !!u.marketing_opt_in, emailVerified: !!u.email_verified, billing: {}, shipping: {},
} : null);

/** Laravel's address → the storefront's address (and back). */
export const addressFromApi = (a) => ({
  id: a.id, label: a.label || '', firstName: a.first_name, lastName: a.last_name, phone: a.phone, country: a.country,
  city: a.city, area: a.area || '', street: a.street, building: a.building || '', floor: a.floor || '', notes: a.notes || '',
  isDefault: !!a.is_default, summary: a.summary,
});
const addressToApi = (a) => ({
  label: a.label || null, first_name: a.firstName, last_name: a.lastName, phone: a.phone, country: a.country || 'LB',
  city: a.city, area: a.area || null, street: a.street, building: a.building || null, floor: a.floor || null, notes: a.notes || null,
  ...(a.isDefault !== undefined ? { is_default: !!a.isDefault } : {}),
});

export const account = {
  /** { accounts, buyer }: buyer is null when signed out. */
  async session() {
    try { return { accounts: true, buyer: buyerFromApi((await laravelApi.get('/auth/me')).data) }; }
    catch (e) { if (e.status === 401) return { accounts: true, buyer: null }; throw e; }
  },
  login: async (email, password) => buyerFromApi((await laravelApi.post('/auth/login', { email, password, remember: true })).data),
  register: async (f) => buyerFromApi((await laravelApi.post('/auth/register', {
    first_name: f.firstName, last_name: f.lastName, email: f.email, phone: f.phone || null, password: f.password, password_confirmation: f.confirm,
  })).data),
  logout: () => laravelApi.post('/auth/logout'),
  forgot: async (email) => (await laravelApi.post('/auth/forgot-password', { email })).message,
  resetValid: async ({ token, email }) => (await laravelApi.post('/auth/reset-password/check', { token, email })).valid,
  reset: async ({ token, email, password, confirm }) => buyerFromApi((await laravelApi.post('/auth/reset-password', { token, email, password, password_confirmation: confirm })).data),
  changePassword: ({ current, next, confirm }) => laravelApi.put('/auth/password', { current_password: current, password: next, password_confirmation: confirm }),
  updateProfile: async ({ firstName, lastName, phone, email, currentPassword }) => buyerFromApi((await laravelApi.patch('/account', {
    first_name: firstName, last_name: lastName, phone: phone || null, ...(email ? { email, current_password: currentPassword } : {}),
  })).data),

  addresses: {
    list: async () => (await laravelApi.get('/account/addresses')).data.map(addressFromApi),
    add: async (a) => addressFromApi((await laravelApi.post('/account/addresses', addressToApi(a))).data),
    update: async (id, a) => addressFromApi((await laravelApi.patch(`/account/addresses/${id}`, addressToApi(a))).data),
    remove: (id) => laravelApi.del(`/account/addresses/${id}`),
    makeDefault: async (id) => addressFromApi((await laravelApi.post(`/account/addresses/${id}/default`)).data),
  },

  wishlist: {
    ids: async () => (await laravelApi.get('/wishlist')).meta.ids.map(String),
    add: (id) => laravelApi.post('/wishlist', { product_id: Number(id) }),
    remove: (id) => laravelApi.del(`/wishlist/${Number(id)}`),
    merge: async (ids) => (await laravelApi.post('/wishlist/merge', { product_ids: ids.map(Number) })).ids.map(String),
  },
};
