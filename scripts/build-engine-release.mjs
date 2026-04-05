#!/usr/bin/env node

import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const [preset, binaryName] = process.argv.slice(2);

if (!preset || !binaryName) {
  console.error('Usage: node scripts/build-engine-release.mjs <preset> <binary-name>');
  process.exit(1);
}

const repoRoot = process.cwd();
const engineRoot = path.join(repoRoot, 'native', 'engine');
const buildDir = path.join(engineRoot, 'build', preset);
const releaseDir = path.join(engineRoot, 'build', 'release');
const sourceBinary = path.join(buildDir, binaryName);
const targetBinary = path.join(releaseDir, binaryName);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('cmake', ['--preset', preset, '-S', 'native/engine']);
run('cmake', ['--build', buildDir, '--config', 'Release']);

mkdirSync(releaseDir, { recursive: true });
copyFileSync(sourceBinary, targetBinary);
