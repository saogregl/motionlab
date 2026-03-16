import { access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const requiredPaths = [
  'AGENTS.md',
  'apps/AGENTS.md',
  'packages/frontend/AGENTS.md',
  'packages/viewport/AGENTS.md',
  'packages/protocol/AGENTS.md',
  'native/engine/AGENTS.md',
  'docs/AGENTS.md',
  'docs/architecture/index.md',
  'docs/architecture/principles.md',
  'docs/architecture/repo-map.md',
  'docs/architecture/runtime-topology.md',
  'docs/architecture/protocol-overview.md',
  'docs/architecture/sensor-architecture.md',
  'docs/architecture/results-architecture.md',
  'docs/domain/glossary.md',
  'docs/domain/product-model.md',
  'docs/domain/simulation-model.md',
  'docs/domain/channel-model.md',
  'docs/decisions/ADR-template.md',
  'docs/workflows/development-workflow.md',
  'docs/workflows/review-workflow.md',
  'docs/quality/testing-strategy.md',
  'docs/briefs/templates/feature-brief.md',
  'agents/skills/architecture-guardian/SKILL.md',
  'agents/skills/repo-cartographer/SKILL.md',
  'agents/skills/protocol-schema-steward/SKILL.md',
  'agents/skills/docs-and-adr-curator/SKILL.md',
  'agents/skills/chrono-runtime-specialist/SKILL.md',
  'agents/skills/frontend-workbench-specialist/SKILL.md',
  'agents/skills/results-storage-architect/SKILL.md',
  'agents/skills/sensor-systems-specialist/SKILL.md',
  'agents/skills/test-strategist/SKILL.md',
  'agents/skills/viewport-performance-guardian/SKILL.md',
  'packages/ui/AGENTS.md',
];

const missing = [];

for (const relativePath of requiredPaths) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length) {
  console.error('Missing required agent-readiness files:');
  for (const relativePath of missing) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

console.log('Required agent-readiness docs are present.');
