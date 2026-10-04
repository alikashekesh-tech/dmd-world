/* WooCommerce REST (wc/v3) client. Keys stay on the server; the admin UI never sees them.
   readOnly blocks every non-GET call before it leaves this process. */
export class WooError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function createWoo({ url, key, secret, queryAuth = false, readOnly = false }) {
  const base = `${url.replace(/\/$/, '')}/wp-json/wc/v3`;
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;

  async function request(method, path, { query, body } = {}) {
    if (readOnly && method !== 'GET') throw new WooError('The store connection is read-only (WOO_READ_ONLY=true). No changes were sent.', 403, 'read_only');
    const u = new URL(base + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    // Some hosts strip the Authorization header; WooCommerce also accepts keys as query parameters over HTTPS.
    if (queryAuth) { u.searchParams.set('consumer_key', key); u.searchParams.set('consumer_secret', secret); }
    let res;
    try {
      res = await fetch(u, {
        method,
        headers: { ...(queryAuth ? {} : { Authorization: auth }), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      throw new WooError(`Could not reach the store (${e.cause?.code || e.name}).`, 502, 'unreachable');
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new WooError(data?.message || `WooCommerce answered ${res.status}.`, res.status, data?.code);
    return { data, total: Number(res.headers.get('x-wp-total') ?? NaN), pages: Number(res.headers.get('x-wp-totalpages') ?? NaN) };
  }

  return {
    base,
    readOnly,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body, query) => request('POST', path, { body, query }),
    put: (path, body, query) => request('PUT', path, { body, query }),
    del: (path, query) => request('DELETE', path, { query }),
    /** Every page of a list endpoint (100 per page), up to `maxPages`. */
    async all(path, query = {}, maxPages = 40) {
      const first = await request('GET', path, { query: { ...query, per_page: 100, page: 1 } });
      const out = [...(first.data || [])];
      const pages = Math.min(maxPages, Number.isFinite(first.pages) ? first.pages : 1);
      for (let p = 2; p <= pages; p++) out.push(...((await request('GET', path, { query: { ...query, per_page: 100, page: p } })).data || []));
      return out;
    },
  };
}
