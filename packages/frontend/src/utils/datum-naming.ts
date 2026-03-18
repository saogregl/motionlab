/**
 * Generates the next sequential datum name ("Datum 1", "Datum 2", …).
 */
export function nextDatumName(datums: Map<string, { name: string }>): string {
  let max = 0;
  for (const { name } of datums.values()) {
    const match = /^Datum (\d+)$/.exec(name);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `Datum ${max + 1}`;
}
