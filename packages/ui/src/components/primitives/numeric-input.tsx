import { ChevronDown, ChevronUp } from 'lucide-react';
import { type KeyboardEvent, useCallback, useRef, useState } from 'react';

import { cn } from '../../lib/utils';

interface NumericInputProps {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function NumericInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 3,
  unit,
  disabled,
  className,
  id,
}: NumericInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = useCallback(
    (v: number) => {
      let clamped = v;
      if (min != null) clamped = Math.max(min, clamped);
      if (max != null) clamped = Math.min(max, clamped);
      return clamped;
    },
    [min, max],
  );

  const increment = useCallback(
    (multiplier: number) => {
      const next = clamp(value + step * multiplier);
      onChange?.(Number(next.toFixed(precision)));
    },
    [value, step, precision, clamp, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        increment(e.shiftKey ? 10 : 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        increment(e.shiftKey ? -10 : -1);
      } else if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue('');
        e.currentTarget.blur();
      }
    },
    [increment],
  );

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setEditValue(value.toFixed(precision));
  }, [value, precision]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(editValue);
    if (!Number.isNaN(parsed)) {
      const clamped = clamp(parsed);
      onChange?.(Number(clamped.toFixed(precision)));
    }
    setEditValue('');
  }, [editValue, clamp, precision, onChange]);

  return (
    <div
      data-slot="numeric-input"
      className={cn(
        'group/numeric-input relative flex h-6 items-center',
        'rounded-[var(--radius-sm)] border border-transparent bg-transparent',
        'hover:bg-[var(--field-base)] hover:border-[var(--border-field-hover)]',
        'focus-within:bg-[var(--field-base)] focus-within:border-[var(--border-field-focus)]',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={isEditing ? editValue : value.toFixed(precision)}
        onChange={(e) => setEditValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="h-full w-full min-w-0 bg-transparent px-1.5 text-right font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-[var(--text-primary)] outline-none"
      />
      {unit && (
        <span className="shrink-0 pr-1 text-[10px] text-[var(--text-tertiary)]">{unit}</span>
      )}
      {/* Stepper arrows — visible on hover */}
      <div className="absolute right-0 top-0 flex h-full flex-col opacity-0 group-hover/numeric-input:opacity-100">
        <button
          type="button"
          tabIndex={-1}
          className="flex h-1/2 w-3 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          onMouseDown={(e) => {
            e.preventDefault();
            increment(1);
          }}
        >
          <ChevronUp className="size-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="flex h-1/2 w-3 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          onMouseDown={(e) => {
            e.preventDefault();
            increment(-1);
          }}
        >
          <ChevronDown className="size-2.5" />
        </button>
      </div>
    </div>
  );
}

export { NumericInput };
export type { NumericInputProps };
