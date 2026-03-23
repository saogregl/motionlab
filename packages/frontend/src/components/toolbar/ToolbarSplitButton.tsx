import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@motionlab/ui';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarSplitButtonProps {
  /** Tooltip for the main button */
  tooltip: string;
  /** Keyboard shortcut hint shown in tooltip */
  shortcut?: string;
  /** Lucide icon component for the main button */
  icon: LucideIcon;
  /** Whether the tool is currently active (highlighted) */
  active?: boolean;
  /** Whether the primary action is disabled */
  mainDisabled?: boolean;
  /** Whether the dropdown trigger is disabled */
  menuDisabled?: boolean;
  /** Handler for the main button click */
  onClickMain: () => void;
  /** DropdownMenu items (DropdownMenuItem, DropdownMenuSeparator, etc.) */
  children: ReactNode;
}

export function ToolbarSplitButton({
  tooltip,
  shortcut,
  icon: Icon,
  active,
  mainDisabled,
  menuDisabled,
  onClickMain,
  children,
}: ToolbarSplitButtonProps) {
  const variant = active ? 'toolbar-active' : 'toolbar';

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={variant}
              size="icon"
              disabled={mainDisabled}
              onClick={onClickMain}
              className="rounded-e-none"
            />
          }
        >
          <Icon className="size-4" />
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={variant}
              size="icon"
              disabled={menuDisabled}
              className="-ms-px w-4 min-w-0 rounded-s-none px-0"
            />
          }
        >
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
