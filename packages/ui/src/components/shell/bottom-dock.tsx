import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DockTab {
  id: string;
  label: string;
}

interface BottomDockProps {
  /** Tab definitions */
  tabs: DockTab[];
  /** Active tab id (controlled) */
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** Expanded state (controlled) */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Content for the active tab */
  children?: ReactNode;
  className?: string;
}

function BottomDock({
  tabs,
  activeTab: controlledActiveTab,
  onTabChange,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  className,
}: BottomDockProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(tabs[0]?.id ?? '');
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(true);

  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const setActiveTab = onTabChange ?? setUncontrolledActiveTab;
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded;

  function handleTabClick(tabId: string) {
    if (tabId === activeTab) {
      // Clicking active tab toggles expand
      setExpanded(!expanded);
    } else {
      setActiveTab(tabId);
      if (!expanded) setExpanded(true);
    }
  }

  return (
    <div
      data-slot="bottom-dock"
      data-expanded={expanded || undefined}
      className={cn('flex shrink-0 flex-col border-t border-border-default bg-bg-panel', className)}
    >
      {/* Tab bar — always visible */}
      <div className="flex h-7 shrink-0 items-center gap-0.5 bg-bg-subtle px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-active={tab.id === activeTab || undefined}
            className={cn(
              'h-5 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-2xs)] font-medium transition-colors',
              tab.id === activeTab
                ? 'bg-bg-panel text-text-primary shadow-[var(--shadow-low)]'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          className="flex size-5 items-center justify-center text-text-tertiary hover:text-text-secondary"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse dock' : 'Expand dock'}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>

      {/* Content area with height transition */}
      <div
        className="overflow-hidden transition-[height] duration-[var(--duration-slow)] ease-[var(--easing-default)]"
        style={{ height: expanded ? 'var(--bottom-dock-h)' : '0px' }}
      >
        <div className="h-full overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export { BottomDock };
export type { BottomDockProps, DockTab };
