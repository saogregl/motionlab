import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface WorkspaceTab {
  id: string;
  label: string;
  active?: boolean;
  dirty?: boolean;
}

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[];
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onNewTab?: () => void;
  className?: string;
}

function WorkspaceTabBar({
  tabs,
  onTabSelect,
  onTabClose,
  onNewTab,
  className,
}: WorkspaceTabBarProps) {
  return (
    <div
      data-slot="workspace-tab-bar"
      className={cn(
        'flex h-[var(--bottom-tabs-h)] shrink-0 items-center gap-0.5 overflow-x-auto border-t border-border-default bg-layer-recessed px-1',
        className,
      )}
    >
      {/* New tab button */}
      {onNewTab && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={onNewTab}
          aria-label="New tab"
        >
          <Plus />
        </Button>
      )}

      {/* Tab items */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-active={tab.active || undefined}
          className={cn(
            'group/tab flex h-6 max-w-[180px] items-center gap-1 px-2 text-[length:var(--text-xs)] font-medium transition-colors',
            tab.active
              ? 'border-t-2 border-t-accent-primary bg-layer-base text-text-primary'
              : 'text-text-secondary hover:bg-[var(--layer-recessed-hover)] hover:text-text-primary',
          )}
          onClick={() => onTabSelect?.(tab.id)}
        >
          {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-text-secondary" />}
          <span className="truncate">{tab.label}</span>
          {onTabClose && (
            <span
              role="button"
              tabIndex={-1}
              className={cn(
                'ml-auto flex size-3.5 shrink-0 items-center justify-center rounded-[1px] text-text-tertiary hover:bg-[var(--layer-recessed-active)] hover:text-text-primary',
                'opacity-0 group-hover/tab:opacity-100',
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose?.(tab.id);
              }}
              aria-label={`Close ${tab.label}`}
            >
              <X className="size-3" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export { WorkspaceTabBar };
export type { WorkspaceTabBarProps, WorkspaceTab };
