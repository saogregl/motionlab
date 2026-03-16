import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = ['exec', 'markdownlint-cli2', 'docs/**/*.md', '*.md', '.github/**/*.md'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status === 0) {
  process.exit(0);
}

if (result.error && result.error.code === 'ENOENT') {
  console.error(
    'markdownlint-cli2 not found. It is a root devDependency — run `pnpm install` first.',
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
