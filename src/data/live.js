/* Keeps the storefront's catalog live: the last catalog is reused from this device straight away (so returning visitors
   see current prices before any network call), then the API refreshes it, and again every few minutes while the tab is
   open. The device copy is only a cache of what the server sent; MySQL is the source.
   Banners are time-limited and the owner can remove them at any moment, so an older device copy's banners are not
   trusted: they show only while the copy is recent, and are withdrawn if the server can't be reached to confirm them
   (otherwise a removed banner could stay on screen for a day while the API is down or slow).
   GET /api/v1/catalog (ETag: an unchanged catalog costs a 304). */
import { useSyncExternalStore } from 'react';
import { applyCatalog, catalog, withdrawBanners } from './index.js';
import { laravelApi } from '../lib/laravelApi.js';

const KEY = 'dmd:catalog:v2';
const MAX_AGE = 24 * 3600e3; // older copies are ignored
const EVERY = 5 * 60e3;
const BANNERS_TRUSTED = 10 * 60e3; // a device copy older than this shows no banners until the server confirms them
const RETRY = 30e3;
const stamp = (data) => Date.parse(data?.generated_at) || 0;

const listeners = new Set();
let status = 'idle'; // idle | loading | ready | failed
const setStatus = (s) => { status = s; for (const fn of listeners) fn(); };

export function bootCatalog() {
  try {
    localStorage.removeItem('dmd:catalog:v1'); // the old store's copy, from before the move to Laravel
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached && Date.now() - stamp(cached) < MAX_AGE && applyCatalog(cached)) {
      if (Date.now() - stamp(cached) > BANNERS_TRUSTED) { withdrawBanners(); held = true; }
      setStatus('ready');
    }
  } catch { /* storage unavailable or corrupt: wait for the network */ }
}

let loading = null;
let fetchedAt = 0;
let confirmed = false; // a catalog from the server (not only the device copy) is on screen
let retry = null;
let held = false; // banners withdrawn until the server's catalog is applied again
export function refreshCatalog() {
  if (loading) return loading;
  if (status !== 'ready') setStatus('loading');
  loading = laravelApi.get('/catalog', { timeout: 20000 })
    .then((data) => {
      fetchedAt = Date.now();
      confirmed = true;
      clearTimeout(retry);
      if (!held && stamp(data) && stamp(data) === catalog.liveAt()) { setStatus('ready'); return true; } // unchanged since the copy on screen
      if (!applyCatalog(data)) throw new Error('bad catalog');
      held = false;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full: keep it in memory only */ }
      setStatus('ready');
      return true;
    })
    .catch(() => {
      if (status !== 'ready') setStatus('failed');
      // Still on the device copy: its banners may have been removed or ended since. Hide them and try again soon.
      if (!confirmed) { withdrawBanners(); held = true; clearTimeout(retry); retry = setTimeout(refreshCatalog, RETRY); }
      return false;
    })
    .finally(() => { loading = null; });
  return loading;
}

/** Refreshes now, then every few minutes while the page is visible, and when the visitor comes back to the tab. */
export function keepCatalogFresh() {
  refreshCatalog();
  const tick = () => { if (document.visibilityState === 'visible' && Date.now() - fetchedAt > EVERY - 5e3) refreshCatalog(); };
  const timer = setInterval(tick, EVERY);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', refreshCatalog);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', refreshCatalog); };
}

/** Re-renders the calling component whenever the catalog changes; returns the catalog version. */
export const useCatalog = () => useSyncExternalStore(catalog.subscribe, catalog.version, catalog.version);

/** 'ready' once a catalog is on screen, else 'loading' or 'failed'. */
export const useCatalogStatus = () => useSyncExternalStore(
  (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  () => status,
  () => status,
);
