// Build config for the admin only (the storefront uses the root vite.config.js).
// Build: npm run build:admin → admin/dist, served at /admin/ (Caddy in production; the root dev server in development).
// The admin calls the same-origin Laravel API at /api/v1/admin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/admin/',
  plugins: [react()],
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true },
});
