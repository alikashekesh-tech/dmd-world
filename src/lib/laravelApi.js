/* The storefront's connection to the Laravel API (/api/v1, same origin: Vite proxies it in development, the web server
   in production). Signing in uses Laravel Sanctum's cookie session: the session cookie is HttpOnly (JavaScript never
   sees it) and every change is protected by the XSRF-TOKEN cookie, sent back as the X-XSRF-TOKEN header.
   Errors come back as {error: {code, message, fields}} and are raised as the same StoreApiError the UI already shows. */
import { StoreApiError } from './storeApi.js';

const BASE = '/api/v1';
const TIMEOUT = 20000;
const OFFLINE = 'We can’t reach the store right now. Check your connection and try again.';

const xsrf = () => {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
let csrfReady = null;
const ensureCsrf = (force = false) => {
  if (force || !xsrf()) csrfReady = null;
  csrfReady ??= fetch(`${BASE}/sanctum/csrf-cookie`, { credentials: 'same-origin' }).then(() => undefined, () => { csrfReady = null; });
  return csrfReady;
};

async function call(method, path, body, { timeout = TIMEOUT, retried = false } = {}) {
  const writes = method !== 'GET';
  if (writes) await ensureCsrf();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(writes && xsrf() ? { 'X-XSRF-TOKEN': xsrf() } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new StoreApiError(e?.name === 'TimeoutError' ? 'The store is taking too long to answer. Please try again.' : OFFLINE, 0, 'offline');
  }
  // An expired CSRF token (a long-open tab): fetch a fresh one and try once more.
  if (res.status === 419 && writes && !retried) {
    await ensureCsrf(true);
    return call(method, path, body, { timeout, retried: true });
  }
  if (res.status === 204) return null;
  if (!/application\/json/i.test(res.headers.get('content-type') || '')) throw new StoreApiError(OFFLINE, res.status || 0, 'offline');
  const data = await res.json().catch(() => null);
  if (data === null) throw new StoreApiError(OFFLINE, res.status, 'offline');
  if (!res.ok) {
    const e = data.error || {};
    // Field errors arrive as lists; the UI shows the first message for each field.
    const fields = e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) : null;
    throw new StoreApiError(e.message || `Something went wrong (${res.status}).`, res.status, e.code, fields);
  }
  return data;
}

export const laravelApi = {
  get: (path, opts) => call('GET', path, undefined, opts),
  post: (path, body, opts) => call('POST', path, body ?? {}, opts),
  put: (path, body, opts) => call('PUT', path, body ?? {}, opts),
  patch: (path, body, opts) => call('PATCH', path, body ?? {}, opts),
  del: (path, opts) => call('DELETE', path, undefined, opts),
};
