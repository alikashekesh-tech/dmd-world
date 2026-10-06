// Production mode: the server also serves the built storefront (SERVE_STOREFRONT=true). Needs `npm run build` first.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStack } from './harness.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const built = existsSync(join(DIST, 'index.html'));

describe('serving the built storefront', { skip: built ? false : 'no storefront build (run npm run build)' }, () => {
  let S;
  before(async () => { S = await startStack({ serveStorefront: true }); });
  after(async () => { await S?.stop(); });

  test('any storefront path gets the app with a strict CSP; the admin is never indexed', async () => {
    for (const path of ['/', '/shop', '/product/9385', '/account/reset']) {
      const r = await S.client().get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), /text\/html/);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
      assert.equal(r.headers.get('cache-control'), 'no-cache');
    }
    assert.match((await S.client().get('/admin/')).headers.get('x-robots-tag') || '', /noindex/);
  });
  test('hashed assets are cached for a year and compressed; a missing asset is a 404, not HTML', async () => {
    const js = readdirSync(join(DIST, 'assets')).find((f) => f.endsWith('.js'));
    const r = await fetch(`${S.base}/assets/${js}`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /immutable/);
    assert.ok(['br', 'gzip'].includes(r.headers.get('content-encoding')));
    assert.equal((await S.client().get('/assets/missing-abc123.js')).status, 404);
    for (const path of ['/../server/.env', '/%2e%2e/server/.env', '/%2e%2e/server/index.mjs', '/..%5cserver%5c.env']) {
      const r = await S.client().get(path);
      assert.equal(r.status, 404, path);
      assert.doesNotMatch(String(r.body), /WOO_KEY|SESSION_SECRET|createServer/, path);
    }
  });
  test('robots.txt keeps private pages out and points to a live sitemap', async () => {
    const robots = await S.client().get('/robots.txt');
    assert.match(robots.body, /Disallow: \/admin/);
    assert.match(robots.body, /Disallow: \/checkout/);
    const map = await S.client().get('/sitemap.xml');
    assert.equal(map.status, 200);
    assert.match(map.body, /<loc>http:\/\/localhost:5173\/product\/\d+<\/loc>/);
    assert.match(map.body, /<loc>http:\/\/localhost:5173\/product-category\/playstation<\/loc>/);
  });
  test('writes to page routes are refused', async () => {
    assert.equal((await S.client().post('/shop', {})).status, 405);
  });
});
