import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const files = execSync('grep -rl "from \'@/" packages/ui/src/', { encoding: 'utf8' }).trim().split('\n');
const srcRoot = 'packages/ui/src';

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const fileDir = path.dirname(file);

  content = content.replace(/from '(@\/[^']+)'/g, (_match, alias) => {
    const target = alias.replace('@/', srcRoot + '/');
    let rel = path.relative(fileDir, target).replaceAll('\\', '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `from '${rel}'`;
  });

  fs.writeFileSync(file, content);
  console.log('Fixed:', file);
}
