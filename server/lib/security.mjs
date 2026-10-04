/* Shared hardening helpers: response headers, client identity, input guards and bounded rate limits. */
import { HttpError } from './http.mjs';

/** Headers for every response. Pages get a strict CSP; API responses can't be framed, sniffed or cached. */
export function securityHeaders(res, kind, { https = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (kind === 'page') {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '));
  } else {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  }
}

/** The caller's address. Behind a reverse proxy, set TRUST_PROXY=true so the proxy's X-Forwarded-For is used. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || '';
}

/** Cookie parsing that never throws on malformed values. */
export function safeCookies(header = '') {
  const out = Object.create(null);
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { continue; }
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/** Route ids must be plain positive integers before they go anywhere near a WooCommerce URL. */
export function idParam(v, what = 'id') {
  const s = String(v ?? '');
  if (!/^[1-9]\d{0,11}$/.test(s)) throw new HttpError(400, `Invalid ${what}.`, 'bad_id');
  return Number(s);
}

/** Strips tags and control characters from short free text (names, addresses, notes). */
export const plainText = (v, max = 200) => String(v ?? '')
  .replace(/<[^>]*>?/g, '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .trim()
  .slice(0, max);

/** Only http(s) URLs are accepted where a URL is stored or linked. */
export function httpUrl(v) {
  if (v == null || v === '') return '';
  let u;
  try { u = new URL(String(v)); } catch { throw new HttpError(400, 'Use a full web address starting with https://'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Only http(s) addresses are allowed.');
  return u.href;
}

/** Fixed-window limiter with a size cap, so it can't grow without bound. */
export function limiter(max, windowMs, cap = 20000) {
  const m = new Map();
  const sweep = () => { const t = Date.now(); for (const [k, a] of m) if (t - a.t > windowMs) m.delete(k); };
  const timer = setInterval(sweep, Math.min(windowMs, 60e3)); timer.unref();
  return {
    ok(k) { const a = m.get(k); return !a || a.n < max || Date.now() - a.t > windowMs; },
    add(k) {
      const t = Date.now(); const a = m.get(k);
      if (a && t - a.t < windowMs) a.n++;
      else { if (m.size >= cap) sweep(); if (m.size >= cap) m.delete(m.keys().next().value); m.set(k, { n: 1, t }); }
    },
    /** Counts this request and says whether it is still within the limit. */
    hit(k) { this.add(k); return m.get(k).n <= max; },
    clear(k) { m.delete(k); },
  };
}
