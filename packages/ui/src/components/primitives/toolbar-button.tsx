import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ToolbarButtonProps {
  /** Tooltip text (required for icon-only buttons) */
  tooltip: string;
  /** Keyboard shortcut hint shown in tooltip */
  shortcut?: string;
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
  shortcut,
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
        <span>{tooltip}</span>
        {shortcut && (
          <kbd className="ms-1.5 inline-block rounded-[var(--radius-sm)] bg-[var(--layer-recessed)] px-1 py-0.5 font-mono text-[length:var(--text-2xs)] text-text-tertiary">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { ToolbarButton };
export type { ToolbarButtonProps };
