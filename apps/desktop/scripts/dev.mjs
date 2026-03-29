#!/usr/bin/env node
/**
 * Dev script that bypasses electron-forge (which doesn't support Vite 8 yet).
 *
 * 1. Builds main + preload bundles with Vite
 * 2. Starts Vite dev server for the renderer
 * 3. Launches Electron with the dev server URL injected as a define
 *
 * electron-forge is still used for packaging (`pnpm build`).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, createServer, version as viteVersion } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function _buildBundle(entry, outFileName, externals) {
  await build({
    root,
    build: {
      outDir: '.vite/build',
      emptyOutDir: false,
      lib: {
        entry: path.join(root, entry),
        formats: ['cjs'],
        fileName: () => outFileName,
      },
      rollupOptions: {
        external: externals,
      },
      minify: false,
      sourcemap: true,
    },
    // Suppress most logs during build
    logLevel: 'warn',
  });
}

async function main() {
  const cdpPort = process.env.MOTIONLAB_DEBUG_CDP_PORT ?? '9222';

  // 1. Start renderer dev server (inline config — avoids CJS/ESM mismatch)
  console.log('[dev] Starting renderer dev server...');
  const uiSrc = path.resolve(root, '../../packages/ui/src');
  const server = await createServer({
    configFile: false,
    root: path.join(root, 'src'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@/': `${uiSrc}/`,
      },
    },
    build: {
      outDir: '../.vite/renderer/main_window',
      emptyOutDir: true,
    },
  });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5174;
  const devUrl = `http://localhost:${port}`;
  console.log(`[dev] Renderer ready at ${devUrl}`);

  // 2. Build main process (inject dev server URL as compile-time define)
  console.log('[dev] Building main process...');
  await build({
    root,
    define: {
      MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(devUrl),
      MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
    },
    build: {
      outDir: '.vite/build',
      emptyOutDir: false,
      lib: {
        entry: path.join(root, 'src/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        external: [
          'electron',
          /^node:.*/,
        ],
      },
      minify: false,
      sourcemap: true,
    },
    logLevel: 'warn',
  });

  // 3. Build preload
  console.log('[dev] Building preload...');
  await build({
    root,
    build: {
      outDir: '.vite/build',
      emptyOutDir: false,
      lib: {
        entry: path.join(root, 'src/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.js',
      },
      rollupOptions: {
        external: ['electron'],
      },
      minify: false,
      sourcemap: true,
    },
    logLevel: 'warn',
  });

  // 4. Launch Electron
  console.log(`[dev] Launching Electron... (Vite ${viteVersion})`);
  // On Windows, .cmd shims require shell:true to execute
  const mainJs = path.join(root, '.vite/build/main.js');
  const child = spawn('npx', ['electron', `--remote-debugging-port=${cdpPort}`, mainJs], {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: '1',
    },
    shell: true,
  });

  child.on('exit', (code) => {
    console.log(`[dev] Electron exited (code ${code})`);
    server.close();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    child.kill();
    server.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    child.kill();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  process.exit(1);
});
