/**
 * Smart engineering value formatter.
 *
 * Uses fixed-point notation for "normal" magnitudes (0.001 .. 9999) and
 * switches to exponential notation for very small or very large values.
 *
 * @param value    The number to format
 * @param sigFigs  Significant digits (default 4)
 * @returns        Formatted string
 */
export function formatEngValue(value: number, sigFigs = 4): string {
  // Near-zero: collapse to clean zero
  if (Math.abs(value) < 1e-10) {
    return (0).toFixed(sigFigs - 1);
  }

  const abs = Math.abs(value);

  // Exponential notation for very small or very large values
  if (abs < 1e-3 || abs >= 1e4) {
    return value.toExponential(sigFigs - 1);
  }

  // toPrecision handles sig figs correctly for the normal range
  return value.toPrecision(sigFigs);
}
