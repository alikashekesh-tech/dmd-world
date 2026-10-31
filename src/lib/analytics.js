/* Google Analytics 4, off until the owner adds a Measurement ID (Admin › Settings) AND the visitor accepts analytics
   cookies. Before both, nothing is loaded and nothing is sent. Only shop data is sent: page views, product ids,
   names, prices in USD, quantities and order totals. Never a name, email, phone, address or account id. */
import { useEffect, useState } from 'react';

const CONSENT = 'dmd:analytics-consent'; // 'granted' | 'denied'
const SENT = 'dmd:ga-purchases'; // order ids already reported, so a reload of the order page can't count one twice
export const CURRENCY = 'USD';

/** "G-XXXXXXX" ids only (anything else is ignored, so a typo can't load a stranger's script). */
export const validMeasurementId = (id) => typeof id === 'string' && /^G-[A-Z0-9]{4,16}$/.test(id.trim());

const round = (n) => Math.round(Number(n || 0) * 100) / 100;
/** A product (and the variant chosen) → a GA4 item. */
export function toItem(p, { variant = null, qty = 1, list = null, index = null } = {}) {
  const at = variant || p;
  const item = { item_id: String(p.id), item_name: p.name, price: round(at.price), quantity: qty };
  if (variant) item.item_variant = variant.label || Object.values(variant.options || {}).join(' / ');
  if (p.brandName) item.item_brand = p.brandName;
  if (list) item.item_list_name = list;
  if (index != null) item.index = index;
  return item;
}
/** The value of some items (price × quantity), in dollars. */
export const valueOf = (items) => round(items.reduce((a, i) => a + i.price * (i.quantity || 1), 0));

/** Remembers an order as reported; false when it already was (a purchase is sent once per order). */
export function firstPurchase(orderId, store = safeStorage()) {
  const id = String(orderId);
  let seen = [];
  try { seen = JSON.parse(store.getItem(SENT)) || []; } catch { seen = []; }
  if (seen.includes(id)) return false;
  try { store.setItem(SENT, JSON.stringify([...seen, id].slice(-50))); } catch { /* storage unavailable */ }
  return true;
}

function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
}

/* ── runtime ─────────────────────────────────────────────────────────── */
let measurementId = null;
let loaded = false;
const listeners = new Set();

export const consent = () => { try { return localStorage.getItem(CONSENT); } catch { return null; } };
const enabled = () => !!measurementId && consent() === 'granted';

function load() {
  if (loaded || !enabled()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag reads `arguments`, not a rest array
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  // Page views are sent by the app on each route change (a single-page app), with Google signals and ads off.
  window.gtag('config', measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
}

/** The owner's Measurement ID from the catalog's settings (or none: analytics stays off). */
export function configure(id) {
  measurementId = validMeasurementId(id) ? id.trim() : null;
  load();
  listeners.forEach((f) => f());
}

/** The visitor's choice from the banner. */
export function setConsent(choice) {
  try { localStorage.setItem(CONSENT, choice === 'granted' ? 'granted' : 'denied'); } catch { /* the banner asks again next visit */ }
  if (choice === 'granted') load();
  listeners.forEach((f) => f());
}

/** Sends one GA4 event, only when configured and accepted. */
export function track(name, params = {}) {
  if (!enabled()) return;
  load();
  window.gtag('event', name, params);
}

export const trackPage = (path) => track('page_view', { page_location: location.origin + path, page_path: path, page_title: document.title });

/** For the banner: whether to ask (an ID is set and the visitor hasn't chosen yet). */
export function useAnalyticsChoice() {
  const [, render] = useState(0);
  useEffect(() => { const f = () => render((n) => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  return { ask: !!measurementId && !consent(), choose: setConsent };
}
