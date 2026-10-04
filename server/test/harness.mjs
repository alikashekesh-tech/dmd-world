/* Test harness: starts a private WooCommerce emulator and a private DMD World server on free ports, with their own
   temporary data folder and settings (never server/.env, never server/data), and gives tests HTTP clients with
   their own cookie jars. Each client also gets its own address (X-Forwarded-For with TRUST_PROXY), so per-address
   rate limits behave as they would for separate visitors. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/auth.mjs';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OWNER_PASSWORD = 'Test-Owner-Pass1!';

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function waitFor(url, ms = 20000) {
  const until = Date.now() + ms;
  let last;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; last = r.status; } catch (e) { last = e.message; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${url} did not come up (${last})`);
}

export async function startStack({ serveStorefront = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dmd-test-'));
  const [emuPort, port] = [await freePort(), await freePort()];
  const key = `ck_test_${randomBytes(6).toString('hex')}`, secret = `cs_test_${randomBytes(10).toString('hex')}`;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    DMD_ENV_FILE: join(dir, 'none.env'), DMD_DATA_DIR: join(dir, 'data'),
    EMU_PORT: String(emuPort), EMU_KEY: key, EMU_SECRET: secret, EMU_DATA: join(dir, 'emulator.json'), EMU_OUTBOX: join(dir, 'outbox'),
    DMD_AUTH_SECRET: randomBytes(32).toString('hex'), STOREFRONT_URL: 'http://localhost:5173',
    PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: 'true',
    WOO_URL: `http://127.0.0.1:${emuPort}`, WOO_KEY: key, WOO_SECRET: secret, WOO_ENV: 'emulator', WOO_READ_ONLY: 'false',
    OWNER_PASSWORD_HASH: hashPassword(OWNER_PASSWORD), SESSION_SECRET: randomBytes(32).toString('hex'),
    ...(serveStorefront ? { SERVE_STOREFRONT: 'true', STOREFRONT_DIST: join(SERVER_DIR, '..', 'dist') } : {}),
  };
  const logs = [];
  const run = (file) => {
    const child = spawn(process.execPath, [file], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => logs.push(String(d)));
    child.stderr.on('data', (d) => logs.push(String(d)));
    return child;
  };
  const emu = run('dev/woo-emulator.mjs');
  await waitFor(`http://127.0.0.1:${emuPort}/`);
  const api = run('index.mjs');
  const base = `http://127.0.0.1:${port}`;
  try { await waitFor(`${base}/healthz`); } catch (e) { throw new Error(`${e.message}\n${logs.join('')}`); }

  let n = 0;
  /** A visitor: own cookies, own address. */
  const client = () => {
    const jar = {};
    const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${++n & 255}`;
    const call = async (method, path, body, headers = {}) => {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const raw = typeof body === 'string';
      const res = await fetch(base + path, {
        method,
        headers: { 'X-Forwarded-For': ip, ...(cookie ? { cookie } : {}), ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      });
      // A response can set a cookie and clear an older copy of it on another Path; keep the one that was set.
      const set = new Set();
      const cleared = [];
      for (const sc of res.headers.getSetCookie()) {
        const [kv] = sc.split(';'); const i = kv.indexOf('=');
        const k = kv.slice(0, i), v = kv.slice(i + 1);
        if (/Max-Age=0/i.test(sc) || !v) cleared.push(k); else { jar[k] = v; set.add(k); }
      }
      for (const k of cleared) if (!set.has(k)) delete jar[k];
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, headers: res.headers, body: data };
    };
    call.get = (p, h) => call('GET', p, undefined, h);
    call.post = (p, b, h) => call('POST', p, b ?? {}, h);
    call.put = (p, b, h) => call('PUT', p, b ?? {}, h);
    call.del = (p, h) => call('DELETE', p, undefined, h);
    call.jar = jar;
    call.ip = ip;
    return call;
  };
  const owner = async () => { const c = client(); const r = await c.post('/admin/api/login', { password: OWNER_PASSWORD }); if (r.status !== 200) throw new Error(`owner login failed: ${JSON.stringify(r.body)}`); return c; };
  const outbox = () => (existsSync(env.EMU_OUTBOX) ? readdirSync(env.EMU_OUTBOX).map((f) => ({ name: f, text: readFileSync(join(env.EMU_OUTBOX, f), 'utf8') })) : []);
  const stop = async () => {
    for (const c of [api, emu]) { try { c.kill(); } catch { /* already gone */ } }
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may hold a file briefly */ }
  };
  return { base, client, owner, outbox, stop, logs, env };
}

let seq = 0;
/** A unique buyer email for this run. */
export const email = (tag = 'buyer') => `${tag}.${Date.now().toString(36)}.${++seq}@example.com`;
export const BUYER_PASSWORD = 'Buyer-Pass-42!';
export async function newBuyer(stack, tag) {
  const c = stack.client();
  const mail = email(tag);
  const r = await c.post('/api/register', { firstName: 'Test', lastName: tag || 'Buyer', email: mail, password: BUYER_PASSWORD, confirm: BUYER_PASSWORD });
  if (r.status !== 200) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  c.email = mail;
  c.id = r.body.buyer.id;
  return c;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
