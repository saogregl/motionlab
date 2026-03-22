import type { Axis } from '../primitives/axis-color-label';
import { AxisColorLabel } from '../primitives/axis-color-label';
import { NumericInput } from '../primitives/numeric-input';
import { cn } from '../../lib/utils';

interface Vec3DisplayProps {
  /** The vector values */
  value: { x: number; y: number; z: number };
  /** Group label (e.g. "Position", "Center of Mass") */
  label: string;
  /** Unit suffix (e.g. "m", "mm") */
  unit?: string;
  /** Decimal places (default 6) */
  precision?: number;
  /** Enable editing via NumericInput */
  editable?: boolean;
  /** Called when an axis value changes (only when editable) */
  onChange?: (axis: Axis, value: number) => void;
  /** NumericInput step (default 0.01) */
  step?: number;
  className?: string;
}

const AXES: Axis[] = ['x', 'y', 'z'];

function Vec3Display({
  value,
  label,
  unit,
  precision = 6,
  editable,
  onChange,
  step = 0.01,
  className,
}: Vec3DisplayProps) {
  return (
    <div data-slot="vec3-display" className={cn(className)}>
      {/* Group header */}
      <div className="flex h-[var(--inspector-row-h)] items-center px-1.5">
        <span className="text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
          {label}
        </span>
        {unit && (
          <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{unit}</span>
        )}
      </div>
      {/* 3-column axis values */}
      <div className="grid grid-cols-3 gap-px px-1.5 pb-1">
        {AXES.map((axis) => (
          <div
            key={axis}
            className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--field-base)] px-1.5 h-6"
          >
            <AxisColorLabel axis={axis} className="shrink-0" />
            {editable ? (
              <NumericInput
                value={value[axis]}
                onChange={(v) => onChange?.(axis, v)}
                precision={precision}
                step={step}
                className="flex-1 !h-5 !border-0 !bg-transparent !rounded-none"
              />
            ) : (
              <span className="flex-1 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)]">
                {value[axis].toFixed(precision)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { Vec3Display };
export type { Vec3DisplayProps };
