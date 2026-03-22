import { cn } from '../../lib/utils';

interface InertiaMatrixDisplayProps {
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
  /** Decimal places (default 6) */
  precision?: number;
  /** Unit label (default "kg m\u00b2") */
  unit?: string;
  className?: string;
}

function Cell({
  value,
  precision,
  diagonal,
  mirror,
}: {
  value: number;
  precision: number;
  diagonal?: boolean;
  mirror?: boolean;
}) {
  const isNearZero = Math.abs(value) < 1e-10;
  return (
    <div
      className={cn(
        'flex h-6 items-center justify-end rounded-[var(--radius-sm)] px-1.5 font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-right',
        diagonal
          ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
          : 'bg-[var(--field-base)]',
        mirror && 'text-[var(--text-tertiary)]',
        isNearZero && !diagonal && 'text-[var(--text-disabled)]',
      )}
    >
      {value.toFixed(precision)}
    </div>
  );
}

function InertiaMatrixDisplay({
  ixx,
  iyy,
  izz,
  ixy,
  ixz,
  iyz,
  precision = 6,
  unit = 'kg m\u00b2',
  className,
}: InertiaMatrixDisplayProps) {
  return (
    <div data-slot="inertia-matrix-display" className={cn('px-1.5 pb-1', className)}>
      {/* Unit label */}
      <div className="flex items-center justify-end pb-0.5">
        <span className="text-[10px] text-[var(--text-tertiary)]">{unit}</span>
      </div>
      {/* 3x3 grid */}
      <div className="grid grid-cols-3 gap-px">
        {/* Row 0: Ixx  Ixy  Ixz */}
        <Cell value={ixx} precision={precision} diagonal />
        <Cell value={ixy} precision={precision} />
        <Cell value={ixz} precision={precision} />
        {/* Row 1: Ixy  Iyy  Iyz */}
        <Cell value={ixy} precision={precision} mirror />
        <Cell value={iyy} precision={precision} diagonal />
        <Cell value={iyz} precision={precision} />
        {/* Row 2: Ixz  Iyz  Izz */}
        <Cell value={ixz} precision={precision} mirror />
        <Cell value={iyz} precision={precision} mirror />
        <Cell value={izz} precision={precision} diagonal />
      </div>
    </div>
  );
}

export { InertiaMatrixDisplay };
export type { InertiaMatrixDisplayProps };
