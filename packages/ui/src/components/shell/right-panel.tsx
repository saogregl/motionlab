import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface RightPanelProps {
  children?: ReactNode;
  className?: string;
}

function RightPanel({ children, className }: RightPanelProps) {
  return (
    <div data-slot="right-panel" className={cn('flex h-full flex-col bg-bg-panel', className)}>
      {children}
    </div>
  );
}

export { RightPanel };
export type { RightPanelProps };
