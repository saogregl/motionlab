import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ToolbarButtonProps {
  /** Tooltip text (required for icon-only buttons) */
  tooltip: string;
  /** Whether the tool is currently active */
  active?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Icon child */
  children: ReactNode;
  className?: string;
}

function ToolbarButton({
  tooltip,
  active,
  disabled,
  onClick,
  children,
  className,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        data-slot="toolbar-button"
        render={
          <Button
            variant={active ? 'toolbar-active' : 'toolbar'}
            size="icon"
            disabled={disabled}
            onClick={onClick}
            className={cn(className)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[length:var(--text-xs)]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export { ToolbarButton };
export type { ToolbarButtonProps };
