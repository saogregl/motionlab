import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Separator } from '../ui/separator';

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
