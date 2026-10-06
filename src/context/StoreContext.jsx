import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getProduct, applyRatings, catalog } from '../data/index.js';
import { useCatalog, keepCatalogFresh } from '../data/live.js';
import { storeApi, guestOrders } from '../lib/storeApi.js';
import { LARAVEL } from '../lib/backend.js';
import { account } from '../lib/account.js';
import { orders as orderApi } from '../lib/orders.js';

const StoreCtx = createContext(null);
const KEY = 'loadout:v1';
const MAX_QTY = 10;

/* Only device conveniences live in the browser: the cart, compare list and a guest's wishlist.
   Account data (profile, orders, the account's wishlist, reviews, messages, stock alerts) lives on the server. */
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => /^\d{1,12}$/.test(x)) : []);
const cartOf = (v) => (Array.isArray(v) ? v.filter((l) => l && /^\d{1,12}$/.test(String(l.id))).map((l) => ({ key: `${l.id}|${l.color || ''}`, id: String(l.id), color: l.color || undefined, qty: Math.max(1, Math.min(MAX_QTY, Number(l.qty) || 1)) })) : []);

function reducer(state, a) {
  switch (a.type) {
    case 'add': {
      const key = `${a.id}|${a.color || ''}`;
      const found = state.cart.find((l) => l.key === key);
      const cart = found ? state.cart.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + a.qty) } : l)) : [...state.cart, { key, id: String(a.id), color: a.color, qty: Math.min(MAX_QTY, a.qty) }];
      return { ...state, cart };
    }
    case 'qty': return { ...state, cart: state.cart.map((l) => (l.key === a.key ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, a.qty)) } : l)) };
    case 'remove': return { ...state, cart: state.cart.filter((l) => l.key !== a.key) };
    case 'clear': return { ...state, cart: [] };
    case 'restore': return { ...state, cart: cartOf(a.cart) };
    case 'wish': return { ...state, wishlist: state.wishlist.includes(a.id) ? state.wishlist.filter((x) => x !== a.id) : [...state.wishlist, a.id] };
    case 'wishlist': return { ...state, wishlist: a.ids };
    case 'compare': return { ...state, compare: state.compare.includes(a.id) ? state.compare.filter((x) => x !== a.id) : [...state.compare, a.id].slice(-4) };
    // Once the live catalog is known, items the store no longer sells leave the cart and lists.
    case 'prune': {
      const known = (id) => !!getProduct(id);
      const cart = state.cart.filter((l) => known(l.id));
      const wishlist = state.wishlist.filter(known);
      const compare = state.compare.filter(known);
      return cart.length === state.cart.length && wishlist.length === state.wishlist.length && compare.length === state.compare.length ? state : { cart, wishlist, compare };
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
  const [state, dispatch] = useReducer(reducer, null, () => { const s = read(); return { cart: cartOf(s.cart), wishlist: ids(s.wishlist), compare: ids(s.compare).slice(-4) }; });
  const [buyer, setBuyer] = useState(undefined); // undefined while the session is being checked
  const [sessionError, setSessionError] = useState(false);
  const [accounts, setAccounts] = useState(true);
  const [orders, setOrders] = useState([]);
  const [ordersMore, setOrdersMore] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  const synced = useRef(null); // the wishlist as last saved to the account
  const ordersPage = useRef(1);

  // The guest wishlist stays on this device; a signed-in buyer's wishlist is saved to their account instead.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ cart: state.cart, compare: state.compare, wishlist: buyer ? read().wishlist || [] : state.wishlist })); } catch { /* storage unavailable */ }
  }, [state, buyer]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (catalog.liveAt()) dispatch({ type: 'prune' }); }, [version]);
  useEffect(() => keepCatalogFresh(), []);

  const loadInbox = useCallback(async () => {
    try { setUnread((await storeApi.get('/me/messages')).items.filter((t) => t.unread).length); } catch { /* badge only */ }
  }, []);
  const loadAccount = useCallback(async () => {
    // Bring this device's guest wishlist into the account once, then the account's list is the one shown.
    const local = toIds(read().wishlist || []);
    if (LARAVEL) {
      // The account's wishlist is kept in MySQL; the server checks every merged id.
      await Promise.allSettled([(async () => {
        const saved = toIds(local.length ? await account.wishlist.merge(local) : await account.wishlist.ids());
        if (local.length) { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), wishlist: [] })); } catch { /* ignore */ } }
        synced.current = JSON.stringify(saved);
        dispatch({ type: 'wishlist', ids: saved });
      })(), (async () => { const r = await orderApi.list(1); ordersPage.current = 1; setOrders(r.items); setOrdersMore(r.pages > 1); })()]);
      return;
    }
    const tasks = [
      (async () => {
        const { ids: saved } = await storeApi.get('/me/wishlist');
        let merged = toIds([...saved, ...local]);
        if (local.length) { merged = toIds((await storeApi.put('/me/wishlist', { ids: merged.map(Number) })).ids); try { localStorage.setItem(KEY, JSON.stringify({ ...read(), wishlist: [] })); } catch { /* ignore */ } }
        synced.current = JSON.stringify(merged);
        dispatch({ type: 'wishlist', ids: merged });
      })(),
      (async () => { const r = await storeApi.get('/me/orders'); ordersPage.current = 1; setOrders(r.items); setOrdersMore((r.pages || 1) > 1); })(),
      (async () => setAlerts((await storeApi.get('/me/alerts')).items.map((a) => String(a.productId))))(),
      loadInbox(),
    ];
    await Promise.allSettled(tasks); // each part can fail alone; the rest still shows
  }, [loadInbox]);

  const checkSession = useCallback(() => {
    setSessionError(false);
    return (LARAVEL ? account.session() : storeApi.get('/session'))
      .then((r) => { setAccounts(r.accounts); setBuyer(r.buyer); if (r.buyer) loadAccount(); })
      .catch(() => { setBuyer(null); setSessionError(true); });
  }, [loadAccount]);
  useEffect(() => {
    checkSession();
    // Laravel sends ratings inside the catalog; the legacy server has a separate endpoint.
    if (!LARAVEL) storeApi.get('/ratings').then(applyRatings).catch(() => {});
  }, [checkSession]);
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
    if (!buyer || LARAVEL) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadInbox(); }, 3 * 60e3);
    return () => clearInterval(t);
  }, [buyer, loadInbox]);

  // Save the account's wishlist shortly after it changes (legacy server; with Laravel each change is saved at once).
  useEffect(() => {
    if (!buyer || LARAVEL || synced.current === null) return undefined;
    const now = JSON.stringify(state.wishlist);
    if (now === synced.current) return undefined;
    const t = setTimeout(() => {
      storeApi.put('/me/wishlist', { ids: state.wishlist.map(Number) }).then((r) => { synced.current = JSON.stringify(toIds(r.ids)); }).catch(() => setToast('Couldn’t save your wishlist. Check your connection.'));
    }, 400);
    return () => clearTimeout(t);
  }, [state.wishlist, buyer]);

  const signedIn = useCallback(async (b) => { setBuyer(b); setSessionError(false); await loadAccount(); return b; }, [loadAccount]);
  const signIn = useCallback(async (email, password) => signedIn(LARAVEL ? await account.login(email, password) : (await storeApi.post('/login', { email, password })).buyer), [signedIn]);
  const register = useCallback(async (fields) => signedIn(LARAVEL ? await account.register(fields) : (await storeApi.post('/register', fields)).buyer), [signedIn]);
  const signOut = useCallback(async () => {
    await (LARAVEL ? account.logout() : storeApi.post('/logout')).catch(() => {});
    // Nothing from the account stays on screen for the next person using this device.
    synced.current = null;
    setBuyer(null); setOrders([]); setOrdersMore(false); setAlerts([]); setUnread(0); dispatch({ type: 'wishlist', ids: [] });
  }, []);
  const refreshOrders = useCallback(async () => {
    if (!buyer) return;
    try { const r = LARAVEL ? await orderApi.list(1) : await storeApi.get('/me/orders'); ordersPage.current = 1; setOrders(r.items); setOrdersMore((r.pages || 1) > 1); } catch { /* keep the last list */ }
  }, [buyer]);
  const loadMoreOrders = useCallback(async () => {
    const r = LARAVEL ? await orderApi.list(ordersPage.current + 1) : await storeApi.get(`/me/orders?page=${ordersPage.current + 1}`);
    ordersPage.current += 1;
    setOrders((list) => [...list, ...r.items.filter((o) => !list.some((x) => x.id === o.id))]);
    setOrdersMore(ordersPage.current < (r.pages || 1));
  }, []);
  const updateOrder = useCallback((o) => setOrders((list) => list.map((x) => (x.id === o.id ? o : x))), []);

  const addToCart = useCallback((id, qty = 1, color, { open = true } = {}) => {
    dispatch({ type: 'add', id: String(id), qty, color });
    if (open) setDrawer(true);
  }, []);
  const toggleWish = useCallback((id) => {
    const p = getProduct(id);
    const had = state.wishlist.includes(id);
    dispatch({ type: 'wish', id });
    setToast(had ? `Removed ${p?.name || 'item'} from your wishlist` : `Saved ${p?.name || 'item'} to your wishlist`);
    // Laravel: saved to the account straight away; if the store refuses, the heart goes back.
    if (LARAVEL && buyer) {
      (had ? account.wishlist.remove(id) : account.wishlist.add(id))
        .then(() => { synced.current = null; })
        .catch((e) => { dispatch({ type: 'wish', id }); setToast(e.status === 404 ? 'That product isn’t available any more.' : 'Couldn’t save your wishlist. Check your connection.'); });
    }
  }, [state.wishlist, buyer]);
  /** Back-in-stock email for a sold-out product (signed-in buyers). */
  const toggleAlert = useCallback(async (id) => {
    const on = alerts.includes(String(id));
    const r = on ? await storeApi.del(`/me/alerts/${id}`) : await storeApi.post('/me/alerts', { productId: Number(id) });
    setAlerts(r.items.map((a) => String(a.productId)));
    return !on;
  }, [alerts]);

  /** Places a real WooCommerce order. Prices and stock are checked by the server, never trusted from here.
      The idempotency key makes a retried submit (double tap, dropped connection) return the same order. */
  const placeOrder = useCallback(async (payload) => {
    const r = LARAVEL
      ? await orderApi.place({ ...payload, items: state.cart.map((l) => ({ id: l.id, qty: l.qty })) })
      : await storeApi.post('/orders', { ...payload, items: state.cart.map((l) => ({ id: Number(l.id), qty: l.qty })) }, { timeout: 45000 });
    if (r.key) guestOrders.add(r.id, r.key);
    dispatch({ type: 'clear' });
    if (buyer) refreshOrders();
    return r;
  }, [state.cart, buyer, refreshOrders]);

  const lines = useMemo(() => state.cart.map((l) => ({ ...l, product: getProduct(l.id) })).filter((l) => l.product), [state.cart, version]); // eslint-disable-line react-hooks/exhaustive-deps -- the catalog version re-reads live prices
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.product.price, 0);
  const savings = lines.reduce((a, l) => a + (l.product.was ? l.qty * (l.product.was - l.product.price) : 0), 0);
  const shipping = 0; // delivery cost is confirmed by DMD after the order

  const value = useMemo(() => ({
    ...state, lines, count, subtotal, savings, shipping, drawer, setDrawer, toast, setToast,
    addToCart,
    setQty: (key, qty) => dispatch({ type: 'qty', key, qty }),
    removeLine: (key) => dispatch({ type: 'remove', key }),
    clearCart: () => dispatch({ type: 'clear' }),
    restoreCart: (cart) => dispatch({ type: 'restore', cart }),
    toggleCompare: (id) => dispatch({ type: 'compare', id }), inCompare: (id) => state.compare.includes(id),
    toggleWish, isWished: (id) => state.wishlist.includes(id),
    // accounts
    buyer, accounts, checking: buyer === undefined, setBuyer, sessionError, retrySession: checkSession,
    user: buyer ? { name: nameOf(buyer), email: buyer.email } : null,
    signIn, register, signOut, signedIn,
    orders, ordersMore, loadMoreOrders, refreshOrders, updateOrder, placeOrder,
    alerts, toggleAlert, hasAlert: (id) => alerts.includes(String(id)),
    unread, refreshInbox: loadInbox,
    catalogVersion: version,
  }), [state, lines, count, subtotal, savings, shipping, drawer, toast, addToCart, toggleWish, buyer, accounts, sessionError, checkSession, signIn, register, signOut, signedIn, orders, ordersMore, loadMoreOrders, refreshOrders, updateOrder, placeOrder, alerts, toggleAlert, unread, loadInbox, version]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
export const useStore = () => useContext(StoreCtx);
