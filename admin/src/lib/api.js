/* Talks to the admin server (never to WooCommerce directly; the keys stay server-side).
   Always same-origin "/admin/api": Vite proxies it in development (vite.config.js); built, the server answers it. */
const BASE = import.meta.env.VITE_ADMIN_API || '/admin/api';
const OFFLINE = 'Can’t reach the admin server. Is it running? (npm --prefix server start)';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function call(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body instanceof Blob ? { 'Content-Type': body.type || 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {},
      body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(OFFLINE, 0, 'offline');
  }
  // A non-JSON answer (proxy error page, HTML fallback) means the API itself wasn't reached.
  if (!/application\/json/i.test(res.headers.get('content-type') || '')) throw new ApiError(OFFLINE, res.status || 0, 'offline');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') window.dispatchEvent(new CustomEvent('adm:signedout'));
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.code);
  }
  return data;
}

export const api = {
  get: (p, opts) => call('GET', p, null, opts),
  post: (p, b) => call('POST', p, b || {}),
  put: (p, b) => call('PUT', p, b || {}),
  del: (p) => call('DELETE', p),
  upload: (file) => call('POST', `/media?filename=${encodeURIComponent(file.name)}`, file),
};

/* Anything that changes store data announces it, so badges, lists and the dashboard refresh. */
export const changed = (what) => window.dispatchEvent(new CustomEvent('adm:changed', { detail: what }));
