import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
