import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ViewportToolbarProps {
  children: ReactNode;
  className?: string;
}

function ViewportToolbar({ children, className }: ViewportToolbarProps) {
  return (
    <div
      data-slot="viewport-toolbar"
      className={cn(
        'flex flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-elevated)] p-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { ViewportToolbar };
export type { ViewportToolbarProps };
