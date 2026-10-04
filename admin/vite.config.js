// Build config for the admin only (the storefront keeps using the root vite.config.js).
// Build: npm --prefix server run build:admin   → admin/dist, served by the admin server at /admin/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/admin/',
  plugins: [react()],
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true },
  define: { 'import.meta.env.VITE_ADMIN_API': JSON.stringify(process.env.VITE_ADMIN_API || '/admin/api') },
});
