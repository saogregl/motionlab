import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, '../../packages/ui/src')}/`,
    },
  },
  build: {
    outDir: '../.vite/renderer/main_window',
    emptyOutDir: true,
  },
});
