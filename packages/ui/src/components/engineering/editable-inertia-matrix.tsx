import { formatEngValue } from '../../lib/format';
import { cn } from '../../lib/utils';
import { NumericInput } from '../primitives/numeric-input';

interface EditableInertiaMatrixProps {
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
  /** Unit label (default "kg m²") */
  unit?: string;
  /** Called when any of the 6 unique inertia values changes */
  onChange: (values: {
    ixx: number;
    iyy: number;
    izz: number;
    ixy: number;
    ixz: number;
    iyz: number;
  }) => void;
  disabled?: boolean;
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

function MirrorCell({ value, sigFigs }: { value: number; sigFigs: number }) {
  const isNearZero = Math.abs(value) < 1e-10;
  return (
    <div
      className={cn(
        'flex h-6 items-center justify-end rounded-none px-1.5 font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-right',
        'bg-[var(--field-elevated)] text-[var(--text-tertiary)]',
        isNearZero && 'text-[var(--text-disabled)]',
      )}
    >
      {formatEngValue(value, sigFigs)}
    </div>
  );
}

function EditableInertiaMatrix({
  ixx,
  iyy,
  izz,
  ixy,
  ixz,
  iyz,
  unit = 'kg m²',
  onChange,
  disabled,
  className,
}: EditableInertiaMatrixProps) {
  const vals = { ixx, iyy, izz, ixy, ixz, iyz };

  const update = (key: keyof typeof vals, value: number) => {
    onChange({ ...vals, [key]: value });
  };

  const inputCls = '!h-6 !border-0 !bg-transparent !rounded-none text-right';
  const diagonalCls =
    'bg-[var(--inertia-diagonal)] font-medium text-[var(--inertia-diagonal-text)]';

  return (
    <div data-slot="editable-inertia-matrix" className={cn('px-1.5 pb-1', className)}>
      {/* Unit label */}
      <div className="flex items-center justify-end pb-0.5">
        <span className="text-[10px] text-[var(--text-tertiary)]">{unit}</span>
      </div>
      {/* 4x4 grid: label col + 3 data cols, header row + 3 data rows */}
      <div className="grid min-w-0 grid-cols-[auto_1fr_1fr_1fr] gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--inspector-grid-border)] bg-[var(--inspector-grid-border)]">
        {/* Header row */}
        <div className="bg-[var(--layer-recessed)]" />
        <HeaderCell label="xx" />
        <HeaderCell label="yy" />
        <HeaderCell label="zz" />
        {/* Row 0: Ixx */}
        <RowLabel label="Ixx" />
        <div className={cn('flex h-6 items-center', diagonalCls)}>
          <NumericInput
            value={ixx}
            onChange={(v) => update('ixx', v)}
            min={0}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={cn(inputCls, diagonalCls)}
          />
        </div>
        <div className="flex h-6 items-center bg-[var(--field-elevated)]">
          <NumericInput
            value={ixy}
            onChange={(v) => update('ixy', v)}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={inputCls}
          />
        </div>
        <div className="flex h-6 items-center bg-[var(--field-elevated)]">
          <NumericInput
            value={ixz}
            onChange={(v) => update('ixz', v)}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={inputCls}
          />
        </div>
        {/* Row 1: Iyy */}
        <RowLabel label="Ixy" />
        <MirrorCell value={ixy} sigFigs={4} />
        <div className={cn('flex h-6 items-center', diagonalCls)}>
          <NumericInput
            value={iyy}
            onChange={(v) => update('iyy', v)}
            min={0}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={cn(inputCls, diagonalCls)}
          />
        </div>
        <div className="flex h-6 items-center bg-[var(--field-elevated)]">
          <NumericInput
            value={iyz}
            onChange={(v) => update('iyz', v)}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={inputCls}
          />
        </div>
        {/* Row 2: Izz */}
        <RowLabel label="Ixz" />
        <MirrorCell value={ixz} sigFigs={4} />
        <MirrorCell value={iyz} sigFigs={4} />
        <div className={cn('flex h-6 items-center', diagonalCls)}>
          <NumericInput
            value={izz}
            onChange={(v) => update('izz', v)}
            min={0}
            step={0.001}
            precision={4}
            disabled={disabled}
            className={cn(inputCls, diagonalCls)}
          />
        </div>
      </div>
    </div>
  );
}

export { EditableInertiaMatrix };
export type { EditableInertiaMatrixProps };
