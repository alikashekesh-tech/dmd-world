import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, relative, isAbsolute } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export const readBody = (req, limit = 2e6) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

export { safeCookies as parseCookies } from './security.mjs';

export function createRouter() {
  const routes = [];
  const add = (method) => (path, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(`^${path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    routes.push({ method, re, keys, handler, opts });
  };
  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), del: add('DELETE'),
    match(method, path) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = path.match(r.re);
        if (!m) continue;
        try { return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; } catch { return null; } // malformed %-encoding
      }
      return null;
    },
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg)/;

/** Picks brotli or gzip from Accept-Encoding and caches the compressed bytes (per file + modified time). */
const packed = new Map();
export function compressed(req, key, body, type) {
  if (!COMPRESSIBLE.test(type) || body.length < 1024) return { body, encoding: null };
  const accept = String(req?.headers['accept-encoding'] || '');
  const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
  if (!encoding) return { body, encoding: null };
  const k = `${encoding}:${key}`;
  let out = packed.get(k);
  if (!out) {
    out = encoding === 'br' ? brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(body, { level: 9 });
    if (packed.size > 500) packed.delete(packed.keys().next().value);
    packed.set(k, out);
  }
  return { body: out, encoding };
}

/** Resolves a URL path inside root, refusing NUL bytes, backslashes, absolute paths and anything outside root. */
function inside(root, rel) {
  let name;
  try { name = decodeURIComponent(rel); } catch { return null; }
  const NUL = String.fromCharCode(0), BACKSLASH = String.fromCharCode(92);
  if (name.includes(NUL) || name.includes(BACKSLASH) || isAbsolute(name)) return null;
  const file = normalize(join(root, name));
  const r = relative(normalize(root), file);
  if (r.startsWith('..') || isAbsolute(r)) return null;
  return file;
}

function send(req, res, target, cache) {
  const type = TYPES[extname(target).toLowerCase()] || 'application/octet-stream';
  const st = statSync(target);
  const { body, encoding } = compressed(req, `${target}:${st.mtimeMs}`, readFileSync(target), type);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, Vary: 'Accept-Encoding', ...(encoding ? { 'Content-Encoding': encoding } : {}), 'Content-Length': body.length });
  res.end(body);
  return true;
}

/** Serves the built admin (admin/dist) under /admin/. Hash routing means index.html covers every screen. */
export function serveStatic(res, root, rel, req) {
  const file = inside(root, rel || 'index.html');
  if (!file) return false;
  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target)) return false;
  return send(req, res, target, target.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
}

/**
 * Serves the built storefront (dist/). Real files are served as they are (hashed assets cached for a year);
 * any other path without a file extension gets index.html so the storefront's own router can show the page.
 * A missing asset answers 404 instead of HTML, so a stale script reference fails loudly rather than strangely.
 */
export function serveSpa(req, res, root, path) {
  const file = inside(root, path.replace(/^\/+/, '') || 'index.html');
  if (!file) return false;
  if (existsSync(file) && statSync(file).isFile()) return send(req, res, file, /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (/\.[a-z0-9]{1,12}$/i.test(path)) return false;
  const index = join(root, 'index.html');
  return existsSync(index) ? send(req, res, index, 'no-cache') : false;
}
