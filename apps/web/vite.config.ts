import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'postcss',
  },
  build: {
    cssMinify: 'esbuild',
  },
  server: {
    port: 5173,
  },
});
