import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/utils';
import { formatEngValue } from '../../lib/format';
import { quatToEulerDeg, eulerDegToQuat, isNearGimbalLock } from '../../lib/quat-math';
import { AxisColorLabel } from '../primitives/axis-color-label';
import { NumericInput } from '../primitives/numeric-input';
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
  /** Enable editing via NumericInput */
  editable?: boolean;
  /** Called when the quaternion value changes (only when editable) */
  onChange?: (q: { x: number; y: number; z: number; w: number }) => void;
  /** Disable input fields */
  disabled?: boolean;
  /** NumericInput step (default: 1 for degrees, 0.01 for quaternion) */
  step?: number;
  className?: string;
}

const AXES: Axis[] = ['x', 'y', 'z'];
const QUAT_COMPONENTS = ['x', 'y', 'z', 'w'] as const;

/** Timeout (ms) after the last euler edit before re-syncing from the quaternion prop. */
const EDIT_SETTLE_MS = 500;

function QuatDisplay({
  value,
  sigFigs,
  precision,
  defaultMode = 'euler',
  label = 'Orientation',
  editable,
  onChange,
  disabled,
  step,
  className,
}: QuatDisplayProps) {
  const [mode, setMode] = useState<OrientationMode>(defaultMode);
  const sf = sigFigs ?? (precision != null ? undefined : 4);

  // --- Local euler state: prevents gimbal-lock snap-back ---
  // When the user edits an euler field, we keep the typed values in local state
  // rather than re-deriving from the quaternion prop (which is lossy at gimbal lock).
  const [localEuler, setLocalEuler] = useState<{ x: number; y: number; z: number } | null>(null);
  const editingRef = useRef(false);
  const editTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local euler FROM the quaternion prop when not actively editing.
  useEffect(() => {
    if (!editingRef.current && mode === 'euler') {
      setLocalEuler(quatToEulerDeg(value));
    }
  }, [value, mode]);

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => clearTimeout(editTimerRef.current);
  }, []);

  const euler = mode === 'euler' ? (localEuler ?? quatToEulerDeg(value)) : null;
  const gimbalLock = mode === 'euler' && isNearGimbalLock(value);

  const handleEulerChange = (axis: Axis, deg: number) => {
    if (!euler || !onChange) return;
    editingRef.current = true;
    const updated = { ...euler, [axis]: deg };
    setLocalEuler(updated);
    onChange(eulerDegToQuat(updated));
    // After edits settle, allow re-sync from the quaternion prop.
    clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(() => {
      editingRef.current = false;
    }, EDIT_SETTLE_MS);
  };

  const handleQuatChange = (comp: (typeof QUAT_COMPONENTS)[number], v: number) => {
    if (!onChange) return;
    onChange({ ...value, [comp]: v });
  };

  return (
    <div data-slot="quat-display" className={cn(className)}>
      {/* Header with toggle */}
      <div className="flex h-5 items-center px-1.5">
        <span className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-secondary)]">
          {label}
        </span>
        {gimbalLock && (
          <span
            className="ms-1 text-[10px] font-semibold text-amber-500"
            title="Near gimbal lock (pitch ≈ ±90°): X and Z rotations are coupled. Consider using quaternion mode for precise control."
          >
            ⚠ gimbal lock
          </span>
        )}
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
              {editable ? (
                <NumericInput
                  value={euler[axis]}
                  onChange={(v) => handleEulerChange(axis, v)}
                  precision={1}
                  step={step ?? 1}
                  disabled={disabled}
                  className="flex-1 !h-5 !border-0 !bg-transparent !rounded-none"
                />
              ) : (
                <span className="flex-1 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)]">
                  {sf != null ? `${formatEngValue(euler[axis], sf)}°` : `${euler[axis].toFixed(precision!)}°`}
                </span>
              )}
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
              {editable ? (
                <NumericInput
                  value={value[comp]}
                  onChange={(v) => handleQuatChange(comp, v)}
                  precision={4}
                  step={step ?? 0.01}
                  disabled={disabled}
                  className="flex-1 !h-5 !border-0 !bg-transparent !rounded-none"
                />
              ) : (
                <span className="flex-1 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)]">
                  {sf != null ? formatEngValue(value[comp], sf) : value[comp].toFixed(precision!)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { QuatDisplay };
export type { QuatDisplayProps, OrientationMode };
