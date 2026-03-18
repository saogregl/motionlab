/**
 * Generates the next sequential joint name ("Joint 1", "Joint 2", ...).
 */
export function nextJointName(joints: Map<string, { name: string }>): string {
  let max = 0;
  for (const { name } of joints.values()) {
    const match = /^Joint (\d+)$/.exec(name);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `Joint ${max + 1}`;
}
