import { cn } from '../../lib/utils';
import { formatEngValue } from '../../lib/format';

interface InertiaMatrixDisplayProps {
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
  /** Significant digits (default 4) */
  sigFigs?: number;
  /** Unit label (default "kg m²") */
  unit?: string;
  className?: string;
}

function HeaderCell({ label }: { label: string }) {
  return (
    <div className="flex h-5 items-center justify-center bg-[var(--layer-recessed)] text-[10px] font-semibold text-[var(--text-tertiary)]">
      {label}
    </div>
  );
}

function RowLabel({ label }: { label: string }) {
  return (
    <div className="flex h-6 items-center justify-center bg-[var(--layer-recessed)] ps-1 pe-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
      {label}
    </div>
  );
}

function Cell({
  value,
  sigFigs,
  diagonal,
  mirror,
}: {
  value: number;
  sigFigs: number;
  diagonal?: boolean;
  mirror?: boolean;
}) {
  const isNearZero = Math.abs(value) < 1e-10;
  return (
    <div
      className={cn(
        'flex h-6 items-center justify-end rounded-none px-1.5 font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-right',
        diagonal
          ? 'bg-[var(--inertia-diagonal)] font-medium text-[var(--inertia-diagonal-text)]'
          : 'bg-[var(--field-elevated)]',
        mirror && 'text-[var(--text-tertiary)]',
        isNearZero && !diagonal && 'text-[var(--text-disabled)]',
      )}
    >
      {formatEngValue(value, sigFigs)}
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
  sigFigs = 4,
  unit = 'kg m²',
  className,
}: InertiaMatrixDisplayProps) {
  return (
    <div data-slot="inertia-matrix-display" className={cn('px-1.5 pb-1', className)}>
      {/* Unit label */}
      <div className="flex items-center justify-end pb-0.5">
        <span className="text-[10px] text-[var(--text-tertiary)]">{unit}</span>
      </div>
      {/* 4x4 grid: label col + 3 data cols, header row + 3 data rows */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--inspector-grid-border)] bg-[var(--inspector-grid-border)]">
        {/* Header row */}
        <div className="bg-[var(--layer-recessed)]" />
        <HeaderCell label="xx" />
        <HeaderCell label="yy" />
        <HeaderCell label="zz" />
        {/* Row 0: Ixx */}
        <RowLabel label="Ixx" />
        <Cell value={ixx} sigFigs={sigFigs} diagonal />
        <Cell value={ixy} sigFigs={sigFigs} />
        <Cell value={ixz} sigFigs={sigFigs} />
        {/* Row 1: Iyy */}
        <RowLabel label="Ixy" />
        <Cell value={ixy} sigFigs={sigFigs} mirror />
        <Cell value={iyy} sigFigs={sigFigs} diagonal />
        <Cell value={iyz} sigFigs={sigFigs} />
        {/* Row 2: Izz */}
        <RowLabel label="Ixz" />
        <Cell value={ixz} sigFigs={sigFigs} mirror />
        <Cell value={iyz} sigFigs={sigFigs} mirror />
        <Cell value={izz} sigFigs={sigFigs} diagonal />
      </div>
    </div>
  );
}

export { InertiaMatrixDisplay };
export type { InertiaMatrixDisplayProps };
