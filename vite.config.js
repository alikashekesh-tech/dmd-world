import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the storefront and the admin call the API server through this dev server ("/api" and
// "/admin/api"), exactly as they do in production, so they work on any port and need no CORS.
const API = process.env.DMD_API_ORIGIN || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  define: {
    __SERVER_FORWARD_CONSOLE__: 'false',
    __BUNDLED_DEV__: 'false',
  },
  server: {
    host: '127.0.0.1',
    // The dev server only needs src/, admin/, shared/ and public/. Never serve the API server's files (sessions,
    // admin state, emulator data, the local test login), the WordPress plugin or anything secret.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/server/**', '**/wordpress/**', '**/video/**', '**/*.log'] },
    proxy: {
      '/api': { target: API, xfwd: true },
      '/admin/api': { target: API, xfwd: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: API, xfwd: true },
      '/admin/api': { target: API, xfwd: true },
    },
  },
  build: {
    // Route-level chunks keep the first page light; the vendor chunk changes rarely and stays cached.
    chunkSizeWarningLimit: 400,
  },
});
