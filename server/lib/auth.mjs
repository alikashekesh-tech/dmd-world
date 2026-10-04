import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { limiter } from './security.mjs';

/* One owner, one password, stored only as an scrypt hash (OWNER_PASSWORD_HASH).
   New hashes use stronger parameters ("scrypt2"); older "scrypt" hashes still verify. */
const N2 = 2 ** 15, R = 8, P = 1, MAXMEM = 96 * 1024 * 1024;
export const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt2:${N2}:${salt}:${scryptSync(String(password), salt, 32, { N: N2, r: R, p: P, maxmem: MAXMEM }).toString('hex')}`;
};

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  let a, hash;
  try {
    if (parts[0] === 'scrypt2' && parts.length === 4) {
      const n = Number(parts[1]);
      if (!Number.isInteger(n) || n < 2 ** 14 || n > 2 ** 17) return false;
      a = scryptSync(String(password), parts[2], 32, { N: n, r: R, p: P, maxmem: MAXMEM }); hash = parts[3];
    } else if (parts[0] === 'scrypt' && parts.length === 3) {
      a = scryptSync(String(password), parts[1], 32); hash = parts[2];
    } else return false;
  } catch { return false; }
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
/** True when a stored hash uses the older, weaker parameters (re-hash it at the next successful sign-in). */
export const needsRehash = (stored) => !String(stored || '').startsWith('scrypt2:');

/**
 * Owner sessions: HMAC-signed tokens. The signing key mixes in the current password hash, so changing the
 * password invalidates every existing session at once. Logged-out tokens are kept on a revocation list until
 * they would have expired anyway.
 */
export function createSessions(keyFn, hours = 12, { isRevoked = () => false, revoke = () => {} } = {}) {
  const sign = (v) => createHmac('sha256', keyFn()).update(v).digest('base64url');
  const read = (token) => {
    if (!token || typeof token !== 'string' || token.length > 512 || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = sign(payload);
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return p && p.exp > Date.now() && !isRevoked(p.n) ? p : null; } catch { return null; }
  };
  return {
    issue() {
      const payload = Buffer.from(JSON.stringify({ exp: Date.now() + hours * 3600e3, n: randomBytes(12).toString('hex'), iat: Date.now() })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    valid: (token) => !!read(token),
    /** Ends this token for good (logout). */
    end(token) { const p = read(token); if (p) revoke(p.n, p.exp); },
    maxAge: hours * 3600,
  };
}

/**
 * "Known device" tokens for the owner: issued after a successful sign-in and kept for 180 days. A known device
 * skips the store-wide brake below, so a stranger flooding wrong passwords can't lock the owner out of their own
 * admin. The per-address limit and the password check still apply to every device.
 */
export function createDeviceTrust(keyFn, days = 180) {
  const sign = (v) => createHmac('sha256', `${keyFn()}:device`).update(v).digest('base64url');
  return {
    issue() { const payload = Buffer.from(JSON.stringify({ exp: Date.now() + days * 864e5, n: randomBytes(9).toString('hex') })).toString('base64url'); return `${payload}.${sign(payload)}`; },
    valid(token) {
      if (!token || typeof token !== 'string' || token.length > 300 || !token.includes('.')) return false;
      const [payload, sig] = token.split('.');
      const expected = sign(payload);
      if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
      try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
    },
    maxAge: days * 86400,
  };
}

/* Slows down password guessing: 5 failures per address lock it out for 10 minutes, and a burst of failures
   from everywhere (a distributed guess) locks owner sign-in for unknown devices for a few minutes. */
const perIp = limiter(5, 10 * 60e3);
const everywhere = limiter(40, 5 * 60e3);
export const loginAllowed = (ip, knownDevice = false) => perIp.ok(ip) && (knownDevice || everywhere.ok('all'));
export function loginFailed(ip) { perIp.add(ip); everywhere.add('all'); }
export const loginSucceeded = (ip) => perIp.clear(ip);
