/* Keeps the storefront's catalog live: the last catalog is reused from this device straight away (so returning visitors
   see current prices before any network call), then the API refreshes it, and again every few minutes while the tab is
   open. The device copy is only a cache of what the server sent; MySQL is the source.
   GET /api/v1/catalog (ETag: an unchanged catalog costs a 304). */
import { useSyncExternalStore } from 'react';
import { applyCatalog, catalog } from './index.js';
import { laravelApi } from '../lib/laravelApi.js';

const KEY = 'dmd:catalog:v2';
const MAX_AGE = 24 * 3600e3; // older copies are ignored
const EVERY = 5 * 60e3;
const stamp = (data) => Date.parse(data?.generated_at) || 0;

const listeners = new Set();
let status = 'idle'; // idle | loading | ready | failed
const setStatus = (s) => { status = s; for (const fn of listeners) fn(); };

export function bootCatalog() {
  try {
    localStorage.removeItem('dmd:catalog:v1'); // the old store's copy, from before the move to Laravel
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached && Date.now() - stamp(cached) < MAX_AGE && applyCatalog(cached)) setStatus('ready');
  } catch { /* storage unavailable or corrupt: wait for the network */ }
}

let loading = null;
let fetchedAt = 0;
export function refreshCatalog() {
  if (loading) return loading;
  if (status !== 'ready') setStatus('loading');
  loading = laravelApi.get('/catalog', { timeout: 20000 })
    .then((data) => {
      fetchedAt = Date.now();
      if (stamp(data) && stamp(data) === catalog.liveAt()) { setStatus('ready'); return true; } // unchanged since the copy on screen
      if (!applyCatalog(data)) throw new Error('bad catalog');
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full: keep it in memory only */ }
      setStatus('ready');
      return true;
    })
    .catch(() => { if (status !== 'ready') setStatus('failed'); return false; })
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
