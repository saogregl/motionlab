import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@motionlab/frontend',
        replacement: path.resolve(__dirname, '../../packages/frontend/src/index.ts'),
      },
      {
        find: '@motionlab/protocol',
        replacement: path.resolve(__dirname, '../../packages/protocol/src/index.ts'),
      },
      {
        find: '@motionlab/ui/globals.css',
        replacement: path.resolve(__dirname, '../../packages/ui/src/globals.css'),
      },
      {
        find: '@motionlab/ui',
        replacement: path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
      {
        find: '@motionlab/viewport',
        replacement: path.resolve(__dirname, '../../packages/viewport/src/index.ts'),
      },
      { find: '@/', replacement: `${path.resolve(__dirname, '../../packages/ui/src')}/` },
    ],
  },
  build: {
    outDir: '../.vite/renderer/main_window',
    emptyOutDir: true,
  },
});
