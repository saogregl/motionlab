import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SelectionChipProps {
  /** Entity type icon (14px) */
  icon?: ReactNode;
  /** Entity display name */
  name: string;
  /** Click handler (e.g., opens inspector) */
  onClick?: () => void;
  className?: string;
}

function SelectionChip({ icon, name, onClick, className }: SelectionChipProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      data-slot="selection-chip"
      className={cn(
        'inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2',
        'bg-[var(--layer-base)] border border-[var(--border-subtle)]',
        'shadow-[var(--shadow-low)] rounded-[var(--radius-md)]',
        onClick && 'cursor-pointer hover:bg-[var(--layer-base-hover)]',
        className,
      )}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {icon && (
        <span data-slot="selection-chip-icon" className="flex size-3.5 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      <span
        data-slot="selection-chip-name"
        className="max-w-[160px] truncate text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]"
      >
        {name}
      </span>
      <ChevronRight className="size-2.5 shrink-0 text-[var(--text-tertiary)]" />
    </Tag>
  );
}

export { SelectionChip };
export type { SelectionChipProps };
