import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:4000', changeOrigin: false } },
  },
  preview: {
    proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:4000', changeOrigin: false } },
  },
});
