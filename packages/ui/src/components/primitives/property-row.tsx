import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PropertyRowProps {
  /** Label text */
  label: string;
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
        'group/property-row flex h-[var(--inspector-row-h)] items-center gap-1 px-2 hover:bg-[var(--hover-overlay)]',
        numeric && 'tabular-nums',
        className,
      )}
    >
      {/* Label */}
      <span
        data-slot="property-row-label"
        className="w-[var(--inspector-label-w)] shrink-0 truncate text-[length:var(--text-sm)] text-[var(--text-secondary)]"
      >
        {label}
      </span>

      {/* Value slot */}
      <div data-slot="property-row-value" className="min-w-0 flex-1">
        {children}
      </div>

      {/* Unit suffix */}
      {unit && (
        <span
          data-slot="property-row-unit"
          className="min-w-[24px] shrink-0 text-right text-[length:var(--text-xs)] text-[var(--text-tertiary)]"
        >
          {unit}
        </span>
      )}

      {/* Reset button */}
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

      {/* Warning icon */}
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
  );
}

export { PropertyRow };
export type { PropertyRowProps };
