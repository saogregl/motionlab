import type { ReactNode } from 'react';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ToolbarGroupProps {
  /** Show vertical separator after this group */
  separator?: boolean;
  children: ReactNode;
  className?: string;
}

function ToolbarGroup({ separator, children, className }: ToolbarGroupProps) {
  return (
    <>
      <div data-slot="toolbar-group" className={cn('flex items-center gap-0.5', className)}>
        {children}
      </div>
      {separator && (
        <Separator orientation="vertical" className="mx-1 h-[18px] bg-border-default" />
      )}
    </>
  );
}

export { ToolbarGroup };
export type { ToolbarGroupProps };
