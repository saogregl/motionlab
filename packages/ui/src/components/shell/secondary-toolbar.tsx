import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SecondaryToolbarProps {
  children: ReactNode;
  /** Right-aligned actions slot */
  rightActions?: ReactNode;
  className?: string;
}

function SecondaryToolbar({ children, rightActions, className }: SecondaryToolbarProps) {
  return (
    <div
      data-slot="secondary-toolbar"
      className={cn(
        'flex h-[var(--toolbar-h)] shrink-0 items-center gap-0.5 border-b border-border-default bg-layer-base px-1.5',
        className,
      )}
    >
      {children}
      {rightActions && (
        <>
          <div className="flex-1" />
          {rightActions}
        </>
      )}
    </div>
  );
}

export { SecondaryToolbar };
export type { SecondaryToolbarProps };
