import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getProduct, catalog, purchaseLimit, variantLimit } from '../data/index.js';
import { optionList } from '../lib/variants.js';
import { useCatalog, keepCatalogFresh } from '../data/live.js';
import { guestOrders } from '../lib/storeApi.js';
import { account } from '../lib/account.js';
import { orders as orderApi } from '../lib/orders.js';
import * as community from '../lib/community.js';
import { CURRENCY, toItem, track, valueOf } from '../lib/analytics.js';

const StoreCtx = createContext(null);
const KEY = 'loadout:v1';
// Input sanity only (the API's own bound). The real limit is each product's stock: see purchaseLimit.
const MAX_LINE_QTY = 1_000_000;
/** A variant of a product (null when it isn't one the store sells now). */
const variantOf = (id, variant) => (variant ? getProduct(id)?.variants?.find((v) => v.id === String(variant)) || null : null);
/** How many can be bought: a variant's own stock, or the product's. */
const limitOf = (id, variant) => (variant ? variantLimit(variantOf(id, variant)) : purchaseLimit(getProduct(id)));
/** Units in the cart that share one stock (a variant's, or a product's across its colour lines), optionally leaving one line out. */
const heldOf = (cart, id, variant, exceptKey) => cart.reduce((n, l) => (l.id === id && (l.variant || '') === (variant || '') && l.key !== exceptKey ? n + l.qty : n), 0);
const keyOf = (id, variant, color) => `${id}|${variant ? `v${variant}` : color || ''}`;

/* Only device conveniences live in the browser: the cart and a guest's wishlist.
   Account data (profile, orders, the account's wishlist, reviews, messages, stock alerts) lives on the server. */
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => /^\d{1,12}$/.test(x)) : []);
const cartOf = (v) => (Array.isArray(v) ? v.filter((l) => l && /^\d{1,12}$/.test(String(l.id))).map((l) => {
  const variant = /^\d{1,12}$/.test(String(l.variant ?? '')) ? String(l.variant) : undefined;
  return { key: keyOf(l.id, variant, l.color), id: String(l.id), variant, color: variant ? undefined : l.color || undefined, qty: Math.max(1, Math.min(MAX_LINE_QTY, Number(l.qty) || 1)) };
}) : []);

function reducer(state, a) {
  switch (a.type) {
    case 'add': {
      const id = String(a.id);
      const variant = a.variant ? String(a.variant) : undefined;
      const key = keyOf(id, variant, a.color);
      const qty = Math.min(a.qty, limitOf(id, variant) - heldOf(state.cart, id, variant), MAX_LINE_QTY); // never more than the stock left
      if (qty < 1) return state;
      const found = state.cart.find((l) => l.key === key);
      const cart = found ? state.cart.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...state.cart, { key, id, variant, color: variant ? undefined : a.color, qty }];
      return { ...state, cart };
    }
    case 'qty': return { ...state, cart: state.cart.map((l) => (l.key === a.key ? { ...l, qty: Math.max(1, Math.min(a.qty, limitOf(l.id, l.variant) - heldOf(state.cart, l.id, l.variant, l.key), MAX_LINE_QTY)) } : l)) };
    case 'remove': return { ...state, cart: state.cart.filter((l) => l.key !== a.key) };
    case 'clear': return { ...state, cart: [] };
    case 'restore': return { ...state, cart: cartOf(a.cart) };
    case 'wish': return { ...state, wishlist: state.wishlist.includes(a.id) ? state.wishlist.filter((x) => x !== a.id) : [...state.wishlist, a.id] };
    case 'wishlist': return { ...state, wishlist: a.ids };
    // Once the live catalog is known, items the store no longer sells leave the cart and lists.
    case 'prune': {
      const known = (id) => !!getProduct(id);
      // A variant the store no longer sells leaves the cart too (its product may still be sold in other options).
      const cart = state.cart.filter((l) => known(l.id) && (!l.variant || variantOf(l.id, l.variant)));
      const wishlist = state.wishlist.filter(known);
      return cart.length === state.cart.length && wishlist.length === state.wishlist.length ? state : { cart, wishlist };
    }
    default: return state;
  }
}

const nameOf = (b) => `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.email;
const toIds = (list) => ids(list).filter((id) => getProduct(id) || !catalog.liveAt());

export function StoreProvider({ children }) {
  const version = useCatalog();
  // Items stay even if this catalog copy doesn't know them yet (a product added since the snapshot); they show
  // once the live catalog arrives, and are dropped only if the live catalog doesn't have them either.
  const [state, dispatch] = useReducer(reducer, null, () => { const s = read(); return { cart: cartOf(s.cart), wishlist: ids(s.wishlist) }; });
  const [buyer, setBuyer] = useState(undefined); // undefined while the session is being checked
  const [sessionError, setSessionError] = useState(false);
  const [accounts, setAccounts] = useState(true);
  const [orders, setOrders] = useState([]);
  const [ordersMore, setOrdersMore] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  const ordersPage = useRef(1);

  // The guest wishlist stays on this device; a signed-in buyer's wishlist is saved to their account instead.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ cart: state.cart, wishlist: buyer ? read().wishlist || [] : state.wishlist })); } catch { /* storage unavailable */ }
  }, [state, buyer]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (catalog.liveAt()) dispatch({ type: 'prune' }); }, [version]);
  useEffect(() => keepCatalogFresh(), []);

  const loadInbox = useCallback(async () => {
    try { setUnread(await community.messages.unread()); } catch { /* badge only */ }
  }, []);
  const loadAccount = useCallback(async () => {
    // Bring this device's guest wishlist into the account once, then the account's list is the one shown.
    const local = toIds(read().wishlist || []);
    // Each part can fail alone; the rest still shows. The account's wishlist is kept in MySQL; the server checks
    // every merged id.
    await Promise.allSettled([(async () => {
      const saved = toIds(local.length ? await account.wishlist.merge(local) : await account.wishlist.ids());
      if (local.length) { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), wishlist: [] })); } catch { /* ignore */ } }
      dispatch({ type: 'wishlist', ids: saved });
    })(), (async () => { const r = await orderApi.list(1); ordersPage.current = 1; setOrders(r.items); setOrdersMore(r.pages > 1); })(),
    (async () => setAlerts(await community.alerts.list()))(), loadInbox()]);
  }, [loadInbox]);

  const checkSession = useCallback(() => {
    setSessionError(false);
    return account.session()
      .then((r) => { setAccounts(r.accounts); setBuyer(r.buyer); if (r.buyer) loadAccount(); })
      .catch(() => { setBuyer(null); setSessionError(true); });
  }, [loadAccount]);
  useEffect(() => { checkSession(); }, [checkSession]);
  // Coming back online (or to the tab) after the store couldn't be reached tries again on its own.
  useEffect(() => {
    if (!sessionError) return undefined;
    const retry = () => { if (document.visibilityState === 'visible') checkSession(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [sessionError, checkSession]);
  // Replies from DMD show up without a reload.
  useEffect(() => {
    if (!buyer) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadInbox(); }, 60e3);
    return () => clearInterval(t);
  }, [buyer, loadInbox]);

  const signedIn = useCallback(async (b) => { setBuyer(b); setSessionError(false); await loadAccount(); return b; }, [loadAccount]);
  const signIn = useCallback(async (email, password) => signedIn(await account.login(email, password)), [signedIn]);
  const register = useCallback(async (fields) => signedIn(await account.register(fields)), [signedIn]);
  const signOut = useCallback(async () => {
    await account.logout().catch(() => {});
    // Nothing from the account stays on screen for the next person using this device.
    setBuyer(null); setOrders([]); setOrdersMore(false); setAlerts([]); setUnread(0); dispatch({ type: 'wishlist', ids: [] });
  }, []);
  const refreshOrders = useCallback(async () => {
    if (!buyer) return;
    try { const r = await orderApi.list(1); ordersPage.current = 1; setOrders(r.items); setOrdersMore((r.pages || 1) > 1); } catch { /* keep the last list */ }
  }, [buyer]);
  const loadMoreOrders = useCallback(async () => {
    const r = await orderApi.list(ordersPage.current + 1);
    ordersPage.current += 1;
    setOrders((list) => [...list, ...r.items.filter((o) => !list.some((x) => x.id === o.id))]);
    setOrdersMore(ordersPage.current < (r.pages || 1));
  }, []);
  const updateOrder = useCallback((o) => setOrders((list) => list.map((x) => (x.id === o.id ? o : x))), []);

  // What the cart holds now, for the add-to-cart messages below (the reducer enforces the same limit).
  const cartNow = useRef(state.cart);
  useEffect(() => { cartNow.current = state.cart; }, [state.cart]);
  /** `choice`: a colour (older carts) or { variant } for a product sold in options. */
  const addToCart = useCallback((id, qty = 1, choice, { open = true } = {}) => {
    const p = getProduct(String(id));
    const { variant, color } = typeof choice === 'object' && choice ? choice : { color: choice };
    if (p?.attributes?.length && !variant) { // sold in options: those are chosen on its page
      setToast(`Choose the options for ${p.name} on its page first`);
      return false;
    }
    const limit = limitOf(String(id), variant);
    const room = limit - heldOf(cartNow.current, String(id), variant ? String(variant) : undefined);
    if (room < 1) {
      setToast(limit === 0 ? `${p?.name || 'This item'} is out of stock` : `All ${limit} available are already in your cart`);
      return false;
    }
    dispatch({ type: 'add', id: String(id), qty, color, variant });
    if (p) { // GA4 (only with consent)
      const v = variantOf(String(id), variant);
      const item = toItem(p, { variant: v && { ...v, label: optionList(p, v).map(([, value]) => value).join(' / ') }, qty: Math.min(qty, room) });
      track('add_to_cart', { currency: CURRENCY, value: valueOf([item]), items: [item] });
    }
    if (qty > room) setToast(`Only ${limit} available: your cart now has all ${limit}`);
    if (open) setDrawer(true);
    return true;
  }, []);
  const toggleWish = useCallback((id) => {
    const p = getProduct(id);
    const had = state.wishlist.includes(id);
    dispatch({ type: 'wish', id });
    setToast(had ? `Removed ${p?.name || 'item'} from your wishlist` : `Saved ${p?.name || 'item'} to your wishlist`);
    // Saved to the account straight away; if the store refuses, the heart goes back.
    if (buyer) {
      (had ? account.wishlist.remove(id) : account.wishlist.add(id))
        .catch((e) => { dispatch({ type: 'wish', id }); setToast(e.status === 404 ? 'That product isn’t available any more.' : 'Couldn’t save your wishlist. Check your connection.'); });
    }
  }, [state.wishlist, buyer]);
  /** Back-in-stock email for a sold-out product, or one variant of it (signed-in buyers). Without a variant, removing
      stops every request for the product (the account's list). */
  const toggleAlert = useCallback(async (id, variant = null) => {
    const on = alerts.some((a) => (variant ? a.key === community.alertKey(id, variant) : a.id === String(id)));
    setAlerts(await (on ? community.alerts.remove(id, variant) : community.alerts.add(id, variant)));
    return !on;
  }, [alerts]);
  const refreshAlerts = useCallback(async () => { if (buyer) setAlerts(await community.alerts.list()); }, [buyer]);
  const alertIds = useMemo(() => [...new Set(alerts.map((a) => a.id))], [alerts]); // products waited for, for the account

  /** Places the order. Prices and stock are checked by the server, never trusted from here.
      The idempotency key makes a retried submit (double tap, dropped connection) return the same order. */
  const placeOrder = useCallback(async (payload) => {
    const r = await orderApi.place({ ...payload, items: state.cart.map((l) => ({ id: l.id, variant: l.variant, qty: l.qty })) });
    if (r.key) guestOrders.add(r.id, r.key);
    dispatch({ type: 'clear' });
    if (buyer) refreshOrders();
    return r;
  }, [state.cart, buyer, refreshOrders]);

  // Each line with its product and, for a product sold in options, its variant: the price, old price and options it shows.
  const lines = useMemo(() => state.cart.map((l) => {
    const product = getProduct(l.id);
    const variant = variantOf(l.id, l.variant);
    const at = variant || product;
    return { ...l, product, variantInfo: variant, price: at?.price, was: at?.was, options: optionList(product, variant) };
  }).filter((l) => l.product), [state.cart, version]); // eslint-disable-line react-hooks/exhaustive-deps -- the catalog version re-reads live prices
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const savings = lines.reduce((a, l) => a + (l.was ? l.qty * (l.was - l.price) : 0), 0);
  const shipping = 0; // the delivery price is added by the live quote and at checkout (deliveryFee in data/index.js)

  const value = useMemo(() => ({
    ...state, lines, count, subtotal, savings, shipping, drawer, setDrawer, toast, setToast,
    addToCart,
    setQty: (key, qty) => dispatch({ type: 'qty', key, qty }),
    removeLine: (key) => {
      const l = lines.find((x) => x.key === key);
      if (l) { const item = toItem(l.product, { variant: l.variantInfo && { ...l.variantInfo, label: l.options.map(([, value]) => value).join(' / ') }, qty: l.qty }); track('remove_from_cart', { currency: CURRENCY, value: valueOf([item]), items: [item] }); }
      dispatch({ type: 'remove', key });
    },
    clearCart: () => dispatch({ type: 'clear' }),
    restoreCart: (cart) => dispatch({ type: 'restore', cart }),
    // How many more of a product can go in the cart, and the most one cart line may be set to (both from stock).
    roomFor: (id, variant) => Math.max(0, limitOf(String(id), variant) - heldOf(state.cart, String(id), variant ? String(variant) : undefined)),
    lineMax: (key) => { const l = state.cart.find((x) => x.key === key); return l ? Math.max(1, limitOf(l.id, l.variant) - heldOf(state.cart, l.id, l.variant, key)) : 1; },
    toggleWish, isWished: (id) => state.wishlist.includes(id),
    // accounts
    buyer, accounts, checking: buyer === undefined, setBuyer, sessionError, retrySession: checkSession,
    user: buyer ? { name: nameOf(buyer), email: buyer.email } : null,
    signIn, register, signOut, signedIn,
    orders, ordersMore, loadMoreOrders, refreshOrders, updateOrder, placeOrder,
    alerts: alertIds, toggleAlert, refreshAlerts,
    // Waiting for this product (any of its variants), or, given a variant, for that one: the request, or null.
    alertFor: (id, variant = null) => alerts.find((a) => (variant ? a.key === community.alertKey(id, variant) : a.key === community.alertKey(id, null))) || null,
    hasAlert: (id) => alertIds.includes(String(id)),
    unread, refreshInbox: loadInbox,
    catalogVersion: version,
  }), [state, lines, count, subtotal, savings, shipping, drawer, toast, addToCart, toggleWish, buyer, accounts, sessionError, checkSession, signIn, register, signOut, signedIn, orders, ordersMore, loadMoreOrders, refreshOrders, updateOrder, placeOrder, alerts, alertIds, toggleAlert, refreshAlerts, unread, loadInbox, version]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
export const useStore = () => useContext(StoreCtx);
