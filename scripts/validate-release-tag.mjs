#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? process.env.RELEASE_TAG;

if (!tag) {
  console.error('Release tag is required. Pass it as an argument or set GITHUB_REF_NAME.');
  process.exit(1);
}

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(`Release tag "${tag}" must match vX.Y.Z.`);
  process.exit(1);
}

const expectedVersion = tag.slice(1);
const repoRoot = process.cwd();

function readVersion(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return pkg.version;
}

const versions = [
  ['package.json', readVersion('package.json')],
  ['apps/desktop/package.json', readVersion('apps/desktop/package.json')],
];

const mismatches = versions.filter(([, version]) => version !== expectedVersion);

if (mismatches.length > 0) {
  for (const [file, version] of mismatches) {
    console.error(`${file} has version ${version}, expected ${expectedVersion}.`);
  }
  process.exit(1);
}

console.log(`Validated release tag ${tag} against ${versions.map(([file]) => file).join(', ')}.`);
