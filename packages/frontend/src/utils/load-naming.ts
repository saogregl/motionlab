/**
 * Generates the next sequential load name ("Load 1", "Load 2", ...).
 */
export function nextLoadName(loads: Map<string, { name: string }>): string {
  let max = 0;
  for (const { name } of loads.values()) {
    const match = /^Load (\d+)$/.exec(name);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `Load ${max + 1}`;
}
