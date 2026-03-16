import { ChevronDown, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface TopBarProps {
  /** Project name display */
  projectName?: string;
  /** Status indicator slot */
  status?: ReactNode;
  /** Right-side actions slot */
  actions?: ReactNode;
  className?: string;
}

function TopBar({ projectName = 'Untitled Project', status, actions, className }: TopBarProps) {
  return (
    <div
      data-slot="top-bar"
      className={cn(
        'flex h-[var(--topbar-h)] shrink-0 items-center border-b border-border-default bg-bg-panel px-3',
        className,
      )}
    >
      {/* Left cluster */}
      <div className="flex min-w-0 items-center gap-2">
        {/* Logo placeholder */}
        <div className="size-5 shrink-0 rounded-[var(--radius-sm)] bg-accent-primary" />
        <span className="max-w-[200px] truncate text-[length:var(--text-base)] font-semibold text-text-primary">
          {projectName}
        </span>
        <ChevronDown className="size-3 shrink-0 text-text-tertiary" />
      </div>

      {/* Center — command search trigger */}
      <div className="flex flex-1 justify-center px-4">
        <button
          type="button"
          className="flex h-7 w-60 items-center gap-1.5 rounded-[var(--radius-md)] border border-border-subtle bg-bg-subtle px-3 text-[length:var(--text-sm)] text-text-tertiary transition-colors hover:border-border-default hover:bg-bg-inset"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search commands...</span>
          <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border-default bg-bg-panel px-1 text-[length:var(--text-2xs)] font-medium text-text-tertiary">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-2">
        {status}
        {actions}
      </div>
    </div>
  );
}

export { TopBar };
export type { TopBarProps };
