import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the storefront (/) and the admin (/admin/) call the Laravel API through this dev server, exactly as
// they do in production behind Caddy (same origin, so no CORS and cookie sessions just work):
//   /api/v1/*, /storage/* → the Laravel API (backend/: npm run api:serve) and the images uploaded to it;
//   /robots.txt, /sitemap.xml → built by Laravel from MySQL.
const LARAVEL = process.env.DMD_LARAVEL_ORIGIN || 'http://127.0.0.1:8000';
const proxy = {
  '/api/v1': { target: LARAVEL, xfwd: true },
  '/storage': { target: LARAVEL, xfwd: true },
  '/robots.txt': { target: LARAVEL, xfwd: true },
  '/sitemap.xml': { target: LARAVEL, xfwd: true },
};

// The one development address: http://127.0.0.1:5173. Laravel gives cookie sessions only to this origin
// (SANCTUM_STATEFUL_DOMAINS in backend/.env), so the server never drifts to another port when 5173 is taken
// (strictPort: it stops with an error instead), and http://localhost:5173 is sent here rather than half-working
// (to the browser and to Sanctum it is a different site, with its own cookies).
const HOST = '127.0.0.1';
const PORT = 5173;
const ORIGIN = `http://${HOST}:${PORT}`;
const redirect = (res, status, location) => {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.end();
};
const canonicalHost = (req, res, next) => {
  if (/^localhost(:\d+)?$/i.test(req.headers.host || '')) return redirect(res, 308, ORIGIN + req.url);
  next();
};

// The owner's admin is its own React app (admin/index.html, hash routes such as /admin/#/orders/12), served at /admin/
// here as in production. Pages under it would otherwise fall through to the storefront (its "GAME OVER" 404):
// /admin → /admin/ (as Caddy does), and a typed or refreshed /admin/orders/12?status=x → /admin/#/orders/12?status=x.
// Only page requests are redirected; the admin's modules and files (/admin/src/…) are served as usual.
const FILE = /\.(?:[cm]?[jt]sx?|css|map|json|html?|png|jpe?g|gif|svg|webp|avif|ico|woff2?|txt)$/i;
const adminPages = (req, res, next) => {
  const [path, qs] = (req.url || '').split('?');
  const page = (req.method === 'GET' || req.method === 'HEAD') && /text\/html/.test(req.headers.accept || '');
  const query = qs ? `?${qs}` : '';
  if (page && path === '/admin') return redirect(res, 302, `/admin/${query}`);
  const route = page && !FILE.test(path) && path.match(/^\/admin\/(?!src\/|@|node_modules\/)(.+?)\/?$/);
  if (route) return redirect(res, 302, `/admin/#/${route[1]}${query}`);
  next();
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dmd-dev-routing',
      configureServer: (s) => { s.middlewares.use(canonicalHost); s.middlewares.use(adminPages); },
      configurePreviewServer: (s) => { s.middlewares.use(canonicalHost); },
    },
  ],
  define: {
    __SERVER_FORWARD_CONSOLE__: 'false',
    __BUNDLED_DEV__: 'false',
  },
  server: {
    host: HOST,
    port: PORT,
    strictPort: true,
    // The dev server only needs src/, admin/, shared/ and public/. Never serve the API's files (backend/: its .env,
    // storage, local test login) or anything secret.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/backend/**', '**/video/**', '**/*.log'] },
    proxy,
  },
  // `npm run preview` (the built storefront) uses the same single address, so signing in works there too.
  preview: { host: HOST, port: PORT, strictPort: true, proxy },
  build: {
    // Route-level chunks keep the first page light; the vendor chunk changes rarely and stays cached.
    chunkSizeWarningLimit: 400,
  },
});
