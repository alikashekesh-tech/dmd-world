/* Keeps the storefront's catalog live: the last live catalog is reused from this device straight away (so returning
   visitors see current prices before any network call), then /api/catalog refreshes it, and again every few
   minutes while the tab is open. If the server can't be reached, the bundled snapshot keeps the shop browsable. */
import { useSyncExternalStore } from 'react';
import { applyLiveCatalog, catalog } from './index.js';
import { storeApi } from '../lib/storeApi.js';

const KEY = 'dmd:catalog:v1';
const MAX_AGE = 24 * 3600e3; // older copies are ignored: the snapshot is as good as day-old live data
const EVERY = 5 * 60e3;

export function bootCatalog() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached && Date.now() - cached.at < MAX_AGE) applyLiveCatalog(cached);
  } catch { /* storage unavailable or corrupt: the snapshot is already loaded */ }
}

let loading = null;
let fetchedAt = 0;
export function refreshCatalog() {
  if (loading) return loading;
  loading = storeApi.get('/catalog', { timeout: 15000 })
    .then((data) => {
      fetchedAt = Date.now();
      if (data.at && data.at === catalog.liveAt()) return true; // nothing changed since the copy on screen
      if (!applyLiveCatalog(data)) return false;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full: keep it in memory only */ }
      return true;
    })
    .catch(() => false)
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

/** Re-renders the calling component whenever the catalog (or its ratings) changes; returns the catalog version. */
export const useCatalog = () => useSyncExternalStore(catalog.subscribe, catalog.version, catalog.version);
