#!/usr/bin/env node

/**
 * Cross-platform protoc resolver for buf generate.
 *
 * Finds protoc from whichever vcpkg triplet is installed, writes a temporary
 * buf config with the resolved protoc_path, runs buf generate, then cleans up.
 *
 * Falls back to buf's bundled protoc when vcpkg protoc is not available
 * (e.g. in CI before a native build).
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Find protoc in any vcpkg triplet's tools directory
const vcpkgInstalled = join(
  ROOT,
  "native",
  "engine",
  "build",
  "vcpkg_installed"
);
let protocPath = null;

if (existsSync(vcpkgInstalled)) {
  let triplets = [];
  try {
    triplets = readdirSync(vcpkgInstalled);
  } catch {
    // ignore
  }

  for (const triplet of triplets) {
    for (const name of ["protoc.exe", "protoc"]) {
      const p = join(vcpkgInstalled, triplet, "tools", "protobuf", name);
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
  const bufConfig = readFileSync(join(ROOT, "buf.gen.yaml"), "utf8");
  const tempDir = mkdtempSync(join(tmpdir(), "buf-gen-"));
  const tempConfig = join(tempDir, "buf.gen.yaml");

  const updatedConfig = bufConfig.replace(
    /^(\s+-\s+protoc_builtin:\s+cpp)$/m,
    `$1\n    protoc_path: ${protocPath.replace(/\\/g, "/")}`
  );

  writeFileSync(tempConfig, updatedConfig);

  try {
    execSync(`npx buf generate --template "${tempConfig}"`, {
      cwd: ROOT,
      stdio: "inherit",
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
} else {
  // Fall back to buf's bundled protoc (e.g. CI without a native build)
  console.log(
    "vcpkg protoc not found — falling back to buf bundled protoc"
  );
  execSync("npx buf generate", {
    cwd: ROOT,
    stdio: "inherit",
  });
}
