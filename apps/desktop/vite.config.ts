import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main.ts',
        vite: { build: { outDir: 'dist-electron' } },
      },
      preload: {
        input: 'src/preload.ts',
        vite: { build: { outDir: 'dist-electron' } },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: 'dist-react',
  },
});
