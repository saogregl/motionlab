import { ChevronDown, Copy, Minus, Search, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '../../lib/utils';

interface TopBarProps {
  /** Project name display */
  projectName?: string;
  /** Status indicator slot */
  status?: ReactNode;
  /** Right-side actions slot */
  actions?: ReactNode;
  className?: string;
}

/**
 * Window control buttons for the custom title bar.
 * Only rendered when running inside the Electron desktop shell.
 */
function WindowControls() {
  const api = (
    globalThis as {
      motionlab?: {
        windowMinimize(): void;
        windowMaximize(): void;
        windowClose(): void;
        windowIsMaximized(): Promise<boolean>;
        onWindowMaximizedChange(cb: (maximized: boolean) => void): void;
      };
    }
  ).motionlab;

  const [maximized, setMaximized] = useState(false);

  const handleMinimize = useCallback(() => api?.windowMinimize(), []);
  const handleMaximize = useCallback(() => api?.windowMaximize(), []);
  const handleClose = useCallback(() => api?.windowClose(), []);

  useEffect(() => {
    if (!api) return;
    api.windowIsMaximized().then(setMaximized);
    api.onWindowMaximizedChange(setMaximized);
  }, []);

  if (!api) return null;

  const btnBase =
    'inline-flex items-center justify-center h-full w-[46px] transition-colors duration-[var(--duration-fast)] text-text-secondary hover:bg-layer-hover [-webkit-app-region:no-drag]';

  return (
    <div className="flex h-full ml-2">
      <button type="button" className={btnBase} onClick={handleMinimize} aria-label="Minimize">
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={btnBase}
        onClick={handleMaximize}
        aria-label={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        className={cn(btnBase, 'hover:bg-[#e81123] hover:text-white')}
        onClick={handleClose}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function TopBar({ projectName = 'Untitled Project', status, actions, className }: TopBarProps) {
  return (
    <div
      data-slot="top-bar"
      className={cn(
        'flex h-[var(--topbar-h)] shrink-0 items-center border-b border-border-default bg-layer-base px-2 [-webkit-app-region:drag]',
        className,
      )}
    >
      {/* Left cluster */}
      <div className="flex min-w-0 items-center gap-2">
        {/* Logo placeholder */}
        <div className="size-3.5 shrink-0 rounded-[1px] bg-[var(--accent-soft)] border border-[var(--accent-primary)]/20" />
        <span className="max-w-[200px] truncate text-[length:var(--text-base)] font-semibold text-text-primary">
          {projectName}
        </span>
        <ChevronDown className="size-3 shrink-0 text-text-tertiary" />
      </div>

      {/* Center — command search trigger */}
      <div className="flex flex-1 justify-center px-4">
        <button
          type="button"
          className="flex h-6 w-52 items-center gap-1 rounded-[var(--radius-sm)] border border-border-subtle bg-layer-recessed px-3 text-[length:var(--text-sm)] text-text-tertiary transition-colors hover:border-border-default hover:bg-field-base [-webkit-app-region:no-drag]"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search commands...</span>
          <kbd className="shrink-0 rounded-[1px] border border-border-default bg-layer-base px-1 text-[length:var(--text-2xs)] font-medium text-text-tertiary">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-3 [-webkit-app-region:no-drag]">
        {status}
        {actions}
      </div>

      {/* Window controls (desktop only) */}
      <WindowControls />
    </div>
  );
}

export { TopBar };
export type { TopBarProps };
