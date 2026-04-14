import { ChevronDown, Copy, Minus, Search, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '../../lib/utils';

interface TopBarProps {
  /** Project name display — omit or pass undefined for home mode */
  projectName?: string;
  /** Whether the project has unsaved changes */
  isDirty?: boolean;
  /** Status indicator slot */
  status?: ReactNode;
  /** Right-side actions slot */
  actions?: ReactNode;
  /** Transport controls (play/pause/step/reset) slot */
  transportControls?: ReactNode;
  /** Called when the logo/brand is clicked (e.g. navigate home) */
  onLogoClick?: () => void;
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

function TopBar({
  projectName,
  isDirty,
  status,
  actions,
  transportControls,
  onLogoClick,
  className,
}: TopBarProps) {
  const hasProject = projectName != null;

  return (
    <div
      data-slot="top-bar"
      className={cn(
        'flex h-[var(--topbar-h)] shrink-0 items-center bg-layer-base ps-2 pe-2 [-webkit-app-region:drag]',
        className,
      )}
    >
      {/* Left cluster */}
      <div className="flex min-w-0 items-center gap-2">
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            className="max-w-[280px] truncate text-[length:var(--text-base)] text-text-primary [-webkit-app-region:no-drag] hover:text-accent-text transition-colors"
          >
            <span className="font-semibold">MotionLab</span>
            {hasProject && (
              <span className="text-text-tertiary">
                {' '}
                / {projectName}
                {isDirty ? '*' : ''}
              </span>
            )}
          </button>
        ) : (
          <span className="max-w-[280px] truncate text-[length:var(--text-base)] text-text-primary">
            <span className="font-semibold">MotionLab</span>
            {hasProject && (
              <span className="text-text-tertiary">
                {' '}
                / {projectName}
                {isDirty ? '*' : ''}
              </span>
            )}
          </span>
        )}
        {hasProject && <ChevronDown className="size-3 shrink-0 text-text-tertiary" />}
      </div>

      {/* Center — command search trigger (only in workbench mode) */}
      {hasProject ? (
        <div className="flex flex-1 justify-center px-4">
          <button
            type="button"
            className="flex h-7 w-56 items-center gap-1.5 rounded-[var(--radius-sm)] bg-transparent px-3 text-[length:var(--text-sm)] text-text-tertiary transition-colors hover:bg-field-base [-webkit-app-region:no-drag]"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">Search commands...</span>
            <kbd className="shrink-0 rounded-[1px] px-1 text-[length:var(--text-2xs)] font-medium text-text-tertiary">
              Ctrl+K
            </kbd>
          </button>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-3 [-webkit-app-region:no-drag]">
        {transportControls}
        {transportControls && <div className="h-4 w-px bg-[var(--border-default)]" />}
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
