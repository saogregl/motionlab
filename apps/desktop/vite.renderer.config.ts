import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'postcss',
  },
  build: {
    outDir: '../.vite/renderer/main_window',
    emptyOutDir: true,
    cssMinify: 'esbuild',
  },
});
