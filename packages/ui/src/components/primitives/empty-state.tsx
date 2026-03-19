import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  hint?: string;
  className?: string;
}

function EmptyState({ icon, message, hint, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center justify-center gap-2 p-6', className)}
    >
      {icon && (
        <span className="flex size-10 items-center justify-center text-[var(--text-tertiary)] opacity-40">
          {icon}
        </span>
      )}
      <span className="text-[length:var(--text-sm)] text-[var(--text-tertiary)]">{message}</span>
      {hint && (
        <span className="text-[length:var(--text-2xs)] text-[var(--text-disabled)]">{hint}</span>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
