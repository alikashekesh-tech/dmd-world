import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the storefront and the admin call their APIs through this dev server, exactly as they do in
// production (same origin, so no CORS and cookie sessions just work):
//   /api/v1/*, /storage/* → the Laravel API (backend/, php artisan serve) and the images uploaded to it.
//   /api/*, /admin/api/*  → the legacy Node server (server/), until each feature has moved to Laravel.
// Order matters: the first matching rule wins, so /api/v1 must stay above /api.
const LARAVEL = process.env.DMD_LARAVEL_ORIGIN || 'http://127.0.0.1:8000';
const API = process.env.DMD_API_ORIGIN || 'http://127.0.0.1:8787';
const proxy = {
  '/api/v1': { target: LARAVEL, xfwd: true },
  '/storage': { target: LARAVEL, xfwd: true },
  '/api': { target: API, xfwd: true },
  '/admin/api': { target: API, xfwd: true },
};

export default defineConfig({
  plugins: [react()],
  define: {
    __SERVER_FORWARD_CONSOLE__: 'false',
    __BUNDLED_DEV__: 'false',
  },
  server: {
    host: '127.0.0.1',
    // The dev server only needs src/, admin/, shared/ and public/. Never serve the API servers' files (Laravel's
    // backend/, the Node server's sessions, admin state, emulator data, the local test login), the WordPress plugin
    // or anything secret.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/server/**', '**/backend/**', '**/wordpress/**', '**/video/**', '**/*.log'] },
    proxy,
  },
  preview: { host: '127.0.0.1', proxy },
  build: {
    // Route-level chunks keep the first page light; the vendor chunk changes rarely and stays cached.
    chunkSizeWarningLimit: 400,
  },
});
