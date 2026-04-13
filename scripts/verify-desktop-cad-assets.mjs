#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const rendererRoot = path.join(repoRoot, 'apps/desktop/.vite/renderer/main_window');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(rendererRoot)) {
  fail(`Renderer output directory not found: ${rendererRoot}`);
}

const requiredFiles = ['occt-wasm/occt-import-js-worker.js', 'occt-wasm/occt-import-js.wasm'];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(rendererRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required CAD runtime asset: ${relativePath}`);
  }
}

const assetsDir = path.join(rendererRoot, 'assets');
if (!fs.existsSync(assetsDir)) {
  fail(`Renderer assets directory not found: ${assetsDir}`);
}

const jsAssets = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(assetsDir, name));

if (jsAssets.length === 0) {
  fail(`No renderer JS bundles found under ${assetsDir}`);
}

const absolutePathRegressions = [];
for (const filePath of jsAssets) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('/occt-wasm/')) {
    absolutePathRegressions.push(path.relative(rendererRoot, filePath));
  }
}

if (absolutePathRegressions.length > 0) {
  fail(
    [
      'Detected absolute "/occt-wasm/" reference(s) in renderer bundles:',
      ...absolutePathRegressions.map((entry) => `- ${entry}`),
    ].join('\n'),
  );
}

console.log('Verified desktop CAD runtime assets and worker URL wiring.');
