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
const canonicalHost = (req, res, next) => {
  if (/^localhost(:\d+)?$/i.test(req.headers.host || '')) {
    res.statusCode = 308;
    res.setHeader('Location', ORIGIN + req.url);
    res.end();
    return;
  }
  next();
};

export default defineConfig({
  plugins: [
    react(),
    { name: 'dmd-canonical-host', configureServer: (s) => { s.middlewares.use(canonicalHost); }, configurePreviewServer: (s) => { s.middlewares.use(canonicalHost); } },
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
