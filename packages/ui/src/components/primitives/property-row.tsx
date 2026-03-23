import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface PropertyRowProps {
  /** Label text or element */
  label: ReactNode;
  /** Optional className for the label (e.g. axis colors) */
  labelClassName?: string;
  /** Explicit tooltip for the label (falls back to label text for strings) */
  labelTooltip?: string;
  /** Unit suffix (e.g. "mm", "deg") */
  unit?: string;
  /** Show reset button */
  showReset?: boolean;
  onReset?: () => void;
  /** Warning message (shows icon) */
  warning?: string;
  /** Numeric display — applies tabular-nums */
  numeric?: boolean;
  /** Children fill the value slot */
  children: ReactNode;
  className?: string;
}

function PropertyRow({
  label,
  labelClassName,
  labelTooltip,
  unit,
  showReset,
  onReset,
  warning,
  numeric,
  children,
  className,
}: PropertyRowProps) {
  return (
    <div
      data-slot="property-row"
      className={cn(
        'group/property-row grid h-[var(--inspector-row-h)] items-center gap-0.5 ps-2 pe-1 hover:bg-[var(--layer-raised-hover)]',
        'grid-cols-[2fr_3fr_auto]',
        numeric && 'tabular-nums',
        className,
      )}
    >
      {/* Label */}
      <span
        data-slot="property-row-label"
        className={cn(
          'flex items-center gap-1 truncate text-[length:var(--text-xs)] text-[var(--text-tertiary)]',
          labelClassName,
        )}
        style={{ minWidth: 'var(--inspector-label-w)' }}
        title={labelTooltip ?? (typeof label === 'string' ? label : undefined)}
      >
        {label}
      </span>

      {/* Value slot */}
      <div data-slot="property-row-value" className="min-w-0 text-[length:var(--text-xs)] text-[var(--text-primary)]">
        {children}
      </div>

      {/* Trailing cell: unit + reset + warning */}
      <div className="flex items-center gap-px">
        {unit && (
          <span
            data-slot="property-row-unit"
            className="min-w-[20px] shrink-0 text-right text-[10px] text-[var(--text-tertiary)]"
          >
            {unit}
          </span>
        )}
        {showReset && (
          <button
            data-slot="property-row-reset"
            type="button"
            className="flex size-3.5 shrink-0 items-center justify-center text-[var(--text-tertiary)] opacity-0 hover:text-[var(--text-primary)] group-hover/property-row:opacity-100"
            onClick={onReset}
            tabIndex={-1}
            aria-label="Reset to default"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
        {warning && (
          <span
            data-slot="property-row-warning"
            className="flex size-3.5 shrink-0 items-center justify-center text-[var(--warning)]"
            title={warning}
          >
            <AlertTriangle className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

export { PropertyRow };
export type { PropertyRowProps };
