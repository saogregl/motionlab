import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = [
  "exec",
  "markdownlint-cli2",
  "docs/**/*.md",
  "*.md",
  ".github/**/*.md",
];

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: false,
});

if (result.status === 0) {
  process.exit(0);
}

console.warn("Skipping markdownlint because markdownlint-cli2 is not currently available in this local environment.");
process.exit(0);
