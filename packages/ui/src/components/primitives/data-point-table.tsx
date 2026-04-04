import { Plus, Trash2 } from 'lucide-react';

import { cn } from '../../lib/utils';
import { NumericInput } from './numeric-input';

export interface DataPointTableColumn {
  header: string;
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
}

export interface DataPointTableProps {
  columns: DataPointTableColumn[];
  rows: number[][];
  onChange: (rows: number[][]) => void;
  disabled?: boolean;
  maxRows?: number;
  minRows?: number;
  className?: string;
}

export function DataPointTable({
  columns,
  rows,
  onChange,
  disabled,
  maxRows = 20,
  minRows = 2,
  className,
}: DataPointTableProps) {
  const count = rows.length;

  const updateCell = (rowIndex: number, colIndex: number, value: number) => {
    const newRows = rows.map((row, i) =>
      i === rowIndex
        ? row.map((cell, j) => (j === colIndex ? value : cell))
        : row,
    );
    onChange(newRows);
  };

  const addRow = () => {
    if (count >= maxRows) return;
    const lastRow = count > 0 ? rows[count - 1] : columns.map(() => 0);
    const prevRow = count > 1 ? rows[count - 2] : columns.map(() => 0);
    const newRow = lastRow.map((v, i) => {
      // For the first column (typically time), extrapolate the step
      if (i === 0 && count > 1) return v + (v - prevRow[i]);
      return v;
    });
    onChange([...rows, newRow]);
  };

  const removeRow = (index: number) => {
    if (count <= minRows) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  const colCount = columns.length;
  const gridCols = `repeat(${colCount}, 1fr) 24px`;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Header */}
      <div
        className="grid gap-1 text-2xs text-[var(--text-tertiary)]"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((col, i) => (
          <span key={i} className="ps-1">{col.header}</span>
        ))}
        <span />
      </div>

      {/* Rows */}
      <div
        className={cn(
          'flex flex-col gap-0.5',
          count > 6 && 'max-h-[168px] overflow-y-auto',
        )}
      >
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-1 items-center"
            style={{ gridTemplateColumns: gridCols }}
          >
            {columns.map((col, colIndex) => (
              <NumericInput
                key={colIndex}
                variant="inline"
                value={row[colIndex] ?? 0}
                onChange={(v) => updateCell(rowIndex, colIndex, v)}
                step={col.step ?? 0.1}
                precision={col.precision ?? 3}
                min={col.min}
                max={col.max}
                disabled={disabled}
              />
            ))}
            <button
              type="button"
              className="flex items-center justify-center size-5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30"
              onClick={() => removeRow(rowIndex)}
              disabled={disabled || count <= minRows}
              title="Remove row"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      <button
        type="button"
        className="flex items-center gap-1 text-2xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 self-start ps-1 pt-0.5"
        onClick={addRow}
        disabled={disabled || count >= maxRows}
      >
        <Plus className="size-3" />
        Add Row
      </button>
    </div>
  );
}
