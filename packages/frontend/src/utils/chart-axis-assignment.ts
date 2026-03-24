import type uPlot from 'uplot';

/**
 * Maps known simulation output units to human-readable axis labels.
 */
const UNIT_LABELS: Record<string, string> = {
  rad: 'Angle (rad)',
  'rad/s': 'Angular Vel. (rad/s)',
  m: 'Length (m)',
  'm/s': 'Velocity (m/s)',
  N: 'Force (N)',
  Nm: 'Torque (Nm)',
};

/** Maximum number of distinct Y-axes before falling back to a single generic axis. */
const MAX_AXES = 3;

export interface AxisLayout {
  scales: Record<string, uPlot.Scale>;
  axes: uPlot.Axis[];
  /** Maps each channelId to the Y-scale key it should use. */
  seriesScaleMap: Map<string, string>;
  /** Whether multiple distinct units are present. */
  mixedUnits: boolean;
}

/**
 * Computes uPlot scale, axis, and per-series scale assignment from
 * the active channel set and their unit metadata.
 *
 * - 1 distinct unit  → single Y-axis with that unit as label
 * - 2-3 distinct units → one Y-axis per unit (left / right / left-stacked)
 * - 4+ distinct units → fallback to single generic "Value" axis
 */
export function computeAxisLayout(
  activeIds: string[],
  channelMap: Map<string, { name: string; unit: string }>,
): AxisLayout {
  // Group channels by unit
  const unitToIds = new Map<string, string[]>();
  for (const id of activeIds) {
    const unit = channelMap.get(id)?.unit ?? '';
    let group = unitToIds.get(unit);
    if (!group) {
      group = [];
      unitToIds.set(unit, group);
    }
    group.push(id);
  }

  const distinctUnits = [...unitToIds.keys()];
  const seriesScaleMap = new Map<string, string>();

  // --- Fallback: 0 channels, 4+ units, or single unit ---
  if (distinctUnits.length <= 1 || distinctUnits.length > MAX_AXES) {
    const label =
      distinctUnits.length === 1
        ? (UNIT_LABELS[distinctUnits[0]] ?? (distinctUnits[0] || 'Value'))
        : 'Value';

    for (const id of activeIds) {
      seriesScaleMap.set(id, 'y');
    }

    return {
      scales: { x: { time: false }, y: {} },
      axes: [{ label: 'Time (s)' }, { scale: 'y', label }],
      seriesScaleMap,
      mixedUnits: distinctUnits.length > 1,
    };
  }

  // --- Multi-axis: 2 or 3 distinct units ---
  const scales: Record<string, uPlot.Scale> = { x: { time: false } };
  const axes: uPlot.Axis[] = [{ label: 'Time (s)' }];

  // Side assignment: first axis left (3), second right (1), third left (3)
  const sides = [3, 1, 3] as const;

  for (let i = 0; i < distinctUnits.length; i++) {
    const unit = distinctUnits[i];
    const scaleKey = i === 0 ? 'y' : `y${i + 1}`;

    scales[scaleKey] = {};
    axes.push({
      scale: scaleKey,
      label: UNIT_LABELS[unit] ?? (unit || 'Value'),
      side: sides[i],
      // Only show grid for the primary axis
      grid: { show: i === 0 },
    });

    const ids = unitToIds.get(unit);
    if (!ids) continue;
    for (const id of ids) {
      seriesScaleMap.set(id, scaleKey);
    }
  }

  return { scales, axes, seriesScaleMap, mixedUnits: true };
}
