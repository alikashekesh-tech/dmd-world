/* Talks to the Laravel API (/api/v1/admin, same origin: Vite proxies it in development, the web server in
   production). The owner signs in with a Sanctum cookie session: the session cookie is HttpOnly (JavaScript never
   sees it) and every change carries the XSRF-TOKEN cookie back as the X-XSRF-TOKEN header.
   Errors arrive as {error: {code, message, fields}} and are raised as ApiError. */
const ROOT = '/api/v1';
const BASE = `${ROOT}/admin`;
const OFFLINE = 'Can’t reach the store’s server. Check that the Laravel API is running, then try again.';

export class ApiError extends Error {
  constructor(message, status, code, fields = null) { super(message); this.status = status; this.code = code; this.fields = fields; }
}

const xsrf = () => {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
let csrfReady = null;
const ensureCsrf = (force = false) => {
  if (force || !xsrf()) csrfReady = null;
  csrfReady ??= fetch(`${ROOT}/sanctum/csrf-cookie`, { credentials: 'same-origin' }).then(() => undefined, () => { csrfReady = null; });
  return csrfReady;
};

async function call(method, path, body, opts = {}) {
  const writes = method !== 'GET';
  if (writes) await ensureCsrf();
  const form = body instanceof FormData;
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}), ...(writes && xsrf() ? { 'X-XSRF-TOKEN': xsrf() } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(OFFLINE, 0, 'offline');
  }
  // A long-open tab's CSRF token expired: fetch a fresh one and try once more.
  if (res.status === 419 && writes && !opts.retried) {
    await ensureCsrf(true);
    return call(method, path, body, { ...opts, retried: true });
  }
  if (res.status === 204) return null;
  // A non-JSON answer (proxy error page, HTML fallback) means the API itself wasn't reached.
  if (!/application\/json/i.test(res.headers.get('content-type') || '')) throw new ApiError(OFFLINE, res.status || 0, 'offline');
  const data = await res.json().catch(() => null);
  if (data === null) throw new ApiError(OFFLINE, res.status, 'offline');
  if (!res.ok) {
    const e = data.error || {};
    if (res.status === 401 && !['/auth/login', '/auth/me'].includes(path)) window.dispatchEvent(new CustomEvent('adm:signedout'));
    const fields = e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) : null;
    throw new ApiError(e.message || `Request failed (${res.status}).`, res.status, e.code, fields);
  }
  return data;
}

export const api = {
  get: (p, opts) => call('GET', p, undefined, opts),
  post: (p, b) => call('POST', p, b ?? {}),
  put: (p, b) => call('PUT', p, b ?? {}),
  patch: (p, b) => call('PATCH', p, b ?? {}),
  del: (p) => call('DELETE', p),
  /** An image for products, categories, brands or banners: checked and stored by the server; returns { url }. */
  upload: async (file) => { const f = new FormData(); f.append('file', file); return (await call('POST', '/uploads', f)).data; },
};

/** A paginated Laravel list → { items, page, pages, total } (the shape the screens' Pager uses). */
export const paged = (r, map = (x) => x) => ({
  ...r, items: (r.data || []).map(map), page: r.meta?.current_page || 1, pages: r.meta?.last_page || 1, total: r.meta?.total ?? (r.data || []).length,
});

/* Anything that changes store data announces it, so badges, lists and the dashboard refresh. */
export const changed = (what) => window.dispatchEvent(new CustomEvent('adm:changed', { detail: what }));
