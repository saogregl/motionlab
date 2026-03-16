import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SecondaryToolbarProps {
  children: ReactNode;
  className?: string;
}

function SecondaryToolbar({ children, className }: SecondaryToolbarProps) {
  return (
    <div
      data-slot="secondary-toolbar"
      className={cn(
        'flex h-[var(--toolbar-h)] shrink-0 items-center gap-1 border-b border-border-default bg-bg-panel px-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { SecondaryToolbar };
export type { SecondaryToolbarProps };
