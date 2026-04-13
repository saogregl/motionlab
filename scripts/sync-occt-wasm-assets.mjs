#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const targetDir = path.join(repoRoot, 'apps/desktop/src/public/occt-wasm');

const sourceCandidates = [
  path.join(repoRoot, 'node_modules/occt-import-js/dist'),
  path.join(repoRoot, 'apps/desktop/node_modules/occt-import-js/dist'),
  path.join(repoRoot, 'packages/viewport/node_modules/occt-import-js/dist'),
];

const filesToMirror = ['occt-import-js.js', 'occt-import-js-worker.js', 'occt-import-js.wasm'];

const sourceDir = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!sourceDir) {
  console.error(
    `Could not locate occt-import-js dist directory. Checked:\n${sourceCandidates.join('\n')}`,
  );
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const fileName of filesToMirror) {
  const from = path.join(sourceDir, fileName);
  if (!fs.existsSync(from)) {
    console.error(`Missing source OCCT file: ${from}`);
    process.exit(1);
  }

  const to = path.join(targetDir, fileName);
  fs.copyFileSync(from, to);
}

for (const existing of fs.readdirSync(targetDir)) {
  if (!filesToMirror.includes(existing)) {
    fs.rmSync(path.join(targetDir, existing), { force: true, recursive: true });
  }
}

console.log(`Synced OCCT WASM assets from ${sourceDir} to ${targetDir}`);
