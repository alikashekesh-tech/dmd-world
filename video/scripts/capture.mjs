// Captures every page of the running dev server (http://127.0.0.1:5173) for the showcase video.
// Output: public/shots/<id>.jpg, public/seq/<id>/0000.jpg..., public/shots/manifest.json (sizes + target rectangles).
// Usage: node scripts/capture.mjs [only-these-ids...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DESK, MOBILE } from '../src/geometry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SITE || 'http://127.0.0.1:5173';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = join(ROOT, 'public', 'shots');
const SEQ = join(ROOT, 'public', 'seq');
const only = process.argv.slice(2);

/* ── demo state ─────────────────────────────────────────────────────────── */
const cart = [{ key: '34198|', id: '34198', qty: 2 }, { key: '21633|', id: '21633', qty: 1 }, { key: '37078|', id: '37078', qty: 1 }];
const wishlist = ['29571', '21839', '36697', '19734', '29463', '39844', '31923', '35349'];
const order = { id: 'LD-482913', date: '2026-10-03', status: 'Processing', total: 136, items: [{ id: '34198', qty: 2 }, { id: '21633', qty: 1 }], email: 'player1@example.com' };
const STATES = {
  fresh: null,
  shopper: { cart, wishlist, user: null, orders: [] },
  player: { cart, wishlist, user: { name: 'Player One', email: 'player1@example.com' }, orders: [order] },
};

/* ── selectors for the things the video circles (CSS-module classes match on their local name) ── */
const HERO = '#main > section:first-child';
const PAGE_HERO = { hero: HERO, heroArt: `${HERO} [class*="_art_"]`, heroTitle: `${HERO} h1`, chips: `${HERO} ul[aria-label]` };
const HOME = {
  scene: `${HERO} [class*="_stage_"]`, console: 'svg a[aria-label^="PlayStation"]', tip: '[class*="_tip_"]',
  cta: `${HERO} a[href="#platform"]`, facts: `${HERO} dl`, title: `${HERO} h1`,
  secPlatform: '#platform', tabs: '#platform [role="tablist"]', ppPanel: '#pp-panel', ppArt: '#pp-panel > div:first-child', ppRail: '#platform [class*="_railWrap_"]',
  secOffers: '#offers', offerCard: '#offers article', offerGrid: '#offers [class*="_grid4_"]', offerChart: '#offers svg',
  secBudget: 'section[aria-labelledby="bs-title"]', budgetControls: 'section[aria-labelledby="bs-title"] [class*="_controls_"]', budgetPicks: 'section[aria-labelledby="bs-title"] [class*="_picks_"]',
  secWorld: 'section[aria-labelledby="wg-title"]', figure: 'section[aria-labelledby="wg-title"] li:first-child', worldGrid: 'section[aria-labelledby="wg-title"] ul',
  secAsk: 'section[aria-labelledby="ask-title"]', askPhone: 'section[aria-labelledby="ask-title"] [class*="_phone_"]', askCopy: 'section[aria-labelledby="ask-title"] h2',
  secCont: 'section[aria-labelledby="cont-title"]', credits: 'section[aria-labelledby="cont-title"] [class*="_row_"]', cont: '#cont-title', contCtas: 'section[aria-labelledby="cont-title"] [class*="_ctas_"]',
};
const D = { w: DESK.cssW, h: DESK.cssH, dsf: DESK.dsf, mobile: false };
const M = { w: MOBILE.cssW, h: MOBILE.cssH, dsf: MOBILE.dsf, mobile: true };

const LIST = [
  { id: 'home', path: '/', state: 'fresh', vp: D, full: true, targets: HOME },
  { id: 'home-seq', path: '/', state: 'fresh', vp: D, seq: 3600 },
  { id: 'home-hover', path: '/', state: 'fresh', vp: D, full: true, hover: HOME.console, targets: { console: HOME.console, tip: HOME.tip } },
  { id: 'home-switch', path: '/', state: 'fresh', platform: 'switch', vp: D, full: true, targets: { ppArt: HOME.ppArt, ppPanel: HOME.ppPanel, tabs: HOME.tabs } },
  { id: 'home-budget', path: '/', state: 'fresh', vp: D, full: true, budget: 9, targets: { budgetPicks: HOME.budgetPicks, budgetControls: HOME.budgetControls } },
  { id: 'shop', path: '/shop', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, filters: 'aside[aria-label="Filters"]', card: '#main article', toolbar: '[class*="_toolbar_"]', loadMore: '[class*="_loadMore_"]', grid: '#main [class*="_grid_"]' } },
  { id: 'shop-mega', path: '/shop', state: 'shopper', vp: D, click: 'header nav button', targets: { mega: '[role="region"][aria-label="Categories"]', megaFeature: '[role="region"][aria-label="Categories"] aside', megaLeft: '[role="region"][aria-label="Categories"] nav' } },
  { id: 'category', path: '/product-category/playstation', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, card: '#main article', grid: '#main [class*="_grid_"]' } },
  { id: 'product', path: '/product/34198', state: 'shopper', vp: D, full: true, targets: { gallery: '#main [class*="_stage_"]', price: '[class*="_priceBox_"]', title: '#main h1', actions: '[class*="_actions_"]', ask: '[class*="_ask_"]', tabs: '#reviews', related: 'section[aria-labelledby="rel"]' } },
  { id: 'categories', path: '/categories', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, stats: `${HERO} dl`, card: '#main li[class*="_card_"]', secBrands: 'section[aria-labelledby="sec1"]', brandCard: 'section[aria-labelledby="sec1"] li[class*="_card_"]' } },
  { id: 'brands', path: '/brands', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, credits: '[class*="_credits_"]', card: '#main [class*="_card_"]', grid: '#main [class*="_grid_"]' } },
  { id: 'cart', path: '/cart', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, summary: 'aside[aria-label="Order summary"]', line: '#main li[class*="_line_"]', lines: '#main [class*="_lines_"]', more: '#main section[class*="_more_"]' } },
  { id: 'cart-drawer', path: '/cart', state: 'shopper', vp: D, click: 'header button[aria-label^="Cart"]', targets: { drawer: 'aside[aria-label="Shopping cart"]' } },
  { id: 'checkout', path: '/checkout', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, levels: 'ol[aria-label="Checkout progress"]', step: 'form [class*="_card_"]', summary: 'aside[aria-label="Order summary"]', payment: 'form [class*="_card_"]:nth-child(4)' } },
  { id: 'order', path: '/order/LD-482913', state: 'player', vp: D, full: true, freeze: 1800, targets: { word: '#order-title', trophy: '[class*="_trophy_"]', card: '#main [class*="_card_"]', levels: 'ol[aria-label="Checkout progress"]' } },
  { id: 'order-seq', path: '/order/LD-482913', state: 'player', vp: D, seq: 1800 },
  { id: 'account-login', path: '/account', state: 'shopper', vp: D, full: true, targets: { panel: '[class*="_authPanel_"]', press: '[class*="_authStage_"]', form: '[class*="_authCard_"]' } },
  { id: 'account', path: '/account', state: 'player', vp: D, full: true, targets: { ...PAGE_HERO, player: '[class*="_player_"]', orders: '[class*="_orders_"]', nav: 'nav[aria-label="Account"]' } },
  { id: 'wishlist', path: '/wishlist', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, grid: '#main [class*="_grid_"]', card: '#main article' } },
  { id: 'contact', path: '/contact', state: 'shopper', vp: D, full: true, targets: { ...PAGE_HERO, cards: '#main [class*="_grid_"]', call: '#main [class*="_primary_"]', ready: '#main [class*="_ready_"]' } },
  { id: 'notfound', path: '/this-page-does-not-exist', state: 'shopper', vp: D, full: true, freeze: 1500, targets: { word: '#nf-title', cont: '[class*="_continue_"]', ctas: '#main [class*="_ctas_"]' } },
  { id: 'notfound-seq', path: '/this-page-does-not-exist', state: 'shopper', vp: D, seq: 1500 },
  { id: 'mobile-home', path: '/', state: 'fresh', vp: M, full: true, targets: { title: `${HERO} h1`, scene: `${HERO} [class*="_stage_"]`, chips: 'ul[aria-label="Shop the desk"]', tabs: HOME.tabs, ppPanel: HOME.ppPanel, offerGrid: HOME.offerGrid, secOffers: HOME.secOffers, secPlatform: HOME.secPlatform } },
  { id: 'mobile-product', path: '/product/21633', state: 'shopper', vp: M, full: true, targets: { gallery: '#main [class*="_stage_"]', price: '[class*="_priceBox_"]', ask: '[class*="_ask_"]' } },
];

/* ── tiny CDP client ────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `dmd-capture-${port}`);
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch { /* starting */ }
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(); const waiters = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method) for (const w of [...waiters]) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.params); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++seq; pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))); ws.send(JSON.stringify({ id: i, method, params }));
});
const once = (method, timeout = 15000) => new Promise((resolve) => { const w = { method, resolve }; waiters.push(w); setTimeout(() => resolve(null), timeout); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};
const go = async (url) => { const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url }); await loaded; };
const metrics = (vp, height) => send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: height ?? vp.h, deviceScaleFactor: vp.dsf, mobile: vp.mobile });

await send('Page.enable');
await send('Runtime.enable');
// Timers would make countdowns and the chat mock-up tick between frames; animations are driven by the clock below instead.
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.setInterval = () => 0;' });

/* ── page helpers ───────────────────────────────────────────────────────── */
const WAIT_IMAGES = `Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))).then(() => document.images.length)`;
const PIN = `(() => { let n = 0; for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.minHeight.endsWith('px') && cs.minHeight !== '0px') { el.style.minHeight = cs.minHeight; n++; } if (cs.maxHeight.endsWith('px')) { el.style.maxHeight = cs.maxHeight; n++; } } return n; })()`;
const FREEZE = (t) => `(() => { const all = document.getAnimations(); for (const a of all) { try { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = ${t}; } } catch (e) {} } return all.length; })()`;
const SEEK = (t) => `(() => { for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition)) { a.pause(); a.currentTime = ${t}; } } catch (e) {} } return 1; })()`;
const RECTS = (sel) => `(() => { const out = {}; for (const [k, s] of Object.entries(${JSON.stringify(sel)})) { const el = document.querySelector(s); if (!el) { out[k] = null; continue; } const r = el.getBoundingClientRect(); out[k] = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; } return out; })()`;
const DOC_H = 'Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))';
const SET_BUDGET = (i) => `(() => { const el = document.querySelector('#bs-range'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '${i}'); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()`;

async function prepare(s) {
  await metrics(s.vp);
  await go(`${BASE}/favicon.svg`); // same origin, but the app does not run here, so it cannot overwrite the demo state
  const st = STATES[s.state];
  await evaluate(`localStorage.clear(); ${st ? `localStorage.setItem('loadout:v1', ${JSON.stringify(JSON.stringify(st))});` : ''} ${s.platform ? `localStorage.setItem('dmd:platform', '${s.platform}');` : ''} 1`);
  await go(`${BASE}${s.path}`);
  await evaluate(`document.fonts.ready.then(() => 1)`);
  await sleep(1200);
}

const manifest = existsSync(join(SHOTS, 'manifest.json')) ? JSON.parse(readFileSync(join(SHOTS, 'manifest.json'), 'utf8')) : {};
mkdirSync(SHOTS, { recursive: true });
mkdirSync(SEQ, { recursive: true });

for (const s of LIST) {
  if (only.length && !only.includes(s.id)) continue;
  const t0 = Date.now();
  await prepare(s);
  const scale = s.vp.dsf;

  if (process.env.DEBUG) console.log(s.id, 'prepared');
  if (s.seq) {
    // Let JS-driven counters finish, then replay every CSS animation from zero, one video frame at a time.
    await evaluate(WAIT_IMAGES);
    await sleep(2600);
    const dir = join(SEQ, s.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const frames = Math.round((s.seq / 1000) * 30) + 1;
    for (let f = 0; f < frames; f++) {
      if (process.env.DEBUG && f < 3) console.log('frame', f);
      await evaluate(SEEK((f * 1000) / 30));
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: s.vp.w, height: s.vp.h, scale: 1 } });
      writeFileSync(join(dir, `${String(f).padStart(4, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    }
    manifest[s.id] = { type: 'seq', frames, w: Math.round(s.vp.w * scale), h: Math.round(s.vp.h * scale) };
    console.log(`${s.id}: ${frames} frames (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    continue;
  }

  let h = s.vp.h;
  if (s.full) {
    // Lock every height the real viewport produced, then grow the viewport to the whole page so everything is "in view".
    await evaluate(PIN);
    h = await evaluate(DOC_H);
    await metrics(s.vp, h);
    await sleep(600);
    h = await evaluate(DOC_H);
    await metrics(s.vp, h);
  }
  if (s.click) { await evaluate(`document.querySelector(${JSON.stringify(s.click)}).click(); 1`); await sleep(900); }
  if (s.budget != null) { await evaluate(SET_BUDGET(s.budget)); await sleep(900); }
  if (s.hover) {
    const r = await evaluate(RECTS({ t: s.hover }));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.t.x + r.t.w / 2, y: r.t.y + r.t.h / 2 });
    await sleep(1200);
  }
  await evaluate(WAIT_IMAGES);
  await sleep(2800);
  await evaluate(FREEZE(s.freeze ?? 3600));
  await sleep(150);
  const rects = s.targets ? await evaluate(RECTS(s.targets)) : {};
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: s.vp.w, height: h, scale: 1 } });
  writeFileSync(join(SHOTS, `${s.id}.jpg`), Buffer.from(shot.data, 'base64'));
  const px = {};
  for (const [k, r] of Object.entries(rects)) px[k] = r && { x: Math.round(r.x * scale), y: Math.round(r.y * scale), w: Math.round(r.w * scale), h: Math.round(r.h * scale) };
  const missing = Object.entries(px).filter(([, v]) => !v).map(([k]) => k);
  manifest[s.id] = { type: 'image', w: Math.round(s.vp.w * scale), h: Math.round(h * scale), mobile: s.vp.mobile, targets: px };
  console.log(`${s.id}: ${manifest[s.id].w}x${manifest[s.id].h}${missing.length ? `  MISSING: ${missing.join(', ')}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

writeFileSync(join(SHOTS, 'manifest.json'), JSON.stringify(manifest, null, 1));
await send('Browser.close').catch(() => {});
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
process.exit(0);
