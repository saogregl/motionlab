import { useState } from 'react';

import { cn } from '../../lib/utils';
import { formatEngValue } from '../../lib/format';
import { quatToEulerDeg } from '../../lib/quat-math';
import { AxisColorLabel } from '../primitives/axis-color-label';
import type { Axis } from '../primitives/axis-color-label';

type OrientationMode = 'euler' | 'quaternion';

interface QuatDisplayProps {
  /** Quaternion value */
  value: { x: number; y: number; z: number; w: number };
  /** Significant digits (default 4) */
  sigFigs?: number;
  /** @deprecated Use sigFigs instead */
  precision?: number;
  /** Default display mode (default 'euler') */
  defaultMode?: OrientationMode;
  /** Group label (default "Orientation") */
  label?: string;
  className?: string;
}

const AXES: Axis[] = ['x', 'y', 'z'];
const QUAT_COMPONENTS = ['x', 'y', 'z', 'w'] as const;

function QuatDisplay({
  value,
  sigFigs,
  precision,
  defaultMode = 'euler',
  label = 'Orientation',
  className,
}: QuatDisplayProps) {
  const [mode, setMode] = useState<OrientationMode>(defaultMode);
  const euler = mode === 'euler' ? quatToEulerDeg(value) : null;
  const sf = sigFigs ?? (precision != null ? undefined : 4);

  return (
    <div data-slot="quat-display" className={cn(className)}>
      {/* Header with toggle */}
      <div className="flex h-5 items-center px-1.5">
        <span className="text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
          {label}
        </span>
        <button
          type="button"
          className="ml-auto rounded-full border border-[var(--border-subtle)] bg-[var(--field-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--border-field-hover)] hover:bg-[var(--field-elevated-hover)]"
          onClick={() => setMode((m) => (m === 'euler' ? 'quaternion' : 'euler'))}
        >
          {mode === 'euler' ? 'DEG' : 'QUAT'}
        </button>
      </div>

      {mode === 'euler' && euler ? (
        /* Euler angles: 3-column colored axis layout */
        <div className="grid grid-cols-3 gap-px px-1.5 pb-1">
          {AXES.map((axis) => (
            <div
              key={axis}
              className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--field-elevated)] px-1 h-6"
            >
              <AxisColorLabel axis={axis} className="shrink-0" />
              <span className="flex-1 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)]">
                {sf != null ? `${formatEngValue(euler[axis], sf)}°` : `${euler[axis].toFixed(precision!)}°`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Quaternion: 4-column layout */
        <div className="grid grid-cols-4 gap-px px-1.5 pb-1">
          {QUAT_COMPONENTS.map((comp) => (
            <div
              key={comp}
              className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--field-elevated)] px-1 h-6"
            >
              <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                {comp.toUpperCase()}
              </span>
              <span className="flex-1 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)]">
                {sf != null ? formatEngValue(value[comp], sf) : value[comp].toFixed(precision!)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { QuatDisplay };
export type { QuatDisplayProps, OrientationMode };
