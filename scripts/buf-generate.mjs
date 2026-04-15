#!/usr/bin/env node

/**
 * Cross-platform protoc resolver for buf generate.
 *
 * Finds protoc from whichever vcpkg triplet is installed, writes a temporary
 * buf config with the resolved protoc_path, runs buf generate, then cleans up.
 *
 * If vcpkg protoc is not available, uses protoc from PATH.
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Find protoc in any vcpkg triplet's tools directory
const vcpkgInstalled = join(ROOT, 'native', 'engine', 'build', 'vcpkg_installed');
let protocPath = null;

if (existsSync(vcpkgInstalled)) {
  let triplets = [];
  try {
    triplets = readdirSync(vcpkgInstalled);
  } catch {
    // ignore
  }

  for (const triplet of triplets) {
    for (const name of ['protoc.exe', 'protoc']) {
      const p = join(vcpkgInstalled, triplet, 'tools', 'protobuf', name);
      if (existsSync(p)) {
        protocPath = p;
        break;
      }
    }
    if (protocPath) break;
  }
}

if (protocPath) {
  console.log(`Using vcpkg protoc: ${protocPath}`);

  // Read the base buf.gen.yaml and inject protoc_path
  const bufConfig = readFileSync(join(ROOT, 'buf.gen.yaml'), 'utf8');
  const tempDir = mkdtempSync(join(tmpdir(), 'buf-gen-'));
  const tempConfig = join(tempDir, 'buf.gen.yaml');

  const updatedConfig = bufConfig.replace(
    /^(\s+-\s+protoc_builtin:\s+cpp)$/m,
    `$1\n    protoc_path: ${protocPath.replace(/\\/g, '/')}`,
  );

  writeFileSync(tempConfig, updatedConfig);

  try {
    execSync(`npx buf generate --template "${tempConfig}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
} else {
  let hasSystemProtoc = false;
  try {
    execFileSync('protoc', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    hasSystemProtoc = true;
  } catch {
    // ignore
  }

  if (hasSystemProtoc) {
    console.log('vcpkg protoc not found - using protoc from PATH');
    execSync('npx buf generate', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } else {
    console.error(
      'No protoc compiler found. Install protobuf-compiler (Linux) or build native/engine once so vcpkg provisions protoc under native/engine/build/vcpkg_installed.',
    );
    process.exit(1);
  }
}
