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

export default defineConfig({
  plugins: [react()],
  define: {
    __SERVER_FORWARD_CONSOLE__: 'false',
    __BUNDLED_DEV__: 'false',
  },
  server: {
    host: '127.0.0.1',
    // The dev server only needs src/, admin/, shared/ and public/. Never serve the API's files (backend/: its .env,
    // storage, local test login) or anything secret.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/backend/**', '**/video/**', '**/*.log'] },
    proxy,
  },
  preview: { host: '127.0.0.1', proxy },
  build: {
    // Route-level chunks keep the first page light; the vendor chunk changes rarely and stays cached.
    chunkSizeWarningLimit: 400,
  },
});
