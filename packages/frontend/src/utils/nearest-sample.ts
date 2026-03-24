import type { StoreSample } from '../stores/traces.js';

/** Binary search for nearest sample to target time */
export function nearestSample(samples: StoreSample[], time: number): StoreSample | undefined {
  if (samples.length === 0) return undefined;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  // Check adjacent sample for closer match
  if (lo > 0 && Math.abs(samples[lo - 1].time - time) < Math.abs(samples[lo].time - time)) {
    return samples[lo - 1];
  }
  return samples[lo];
}
