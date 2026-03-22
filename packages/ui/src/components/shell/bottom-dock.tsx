import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { cn } from '../../lib/utils';

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
      className={cn(
        'flex h-full flex-col border-t border-border-default bg-layer-base',
        className,
      )}
    >
      {/* Tab bar — always visible */}
      <div className="flex h-8 shrink-0 items-center bg-[var(--tab-contained-bg)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-active={tab.id === activeTab || undefined}
            className={cn(
              'h-full px-4 font-medium tracking-normal text-[length:var(--text-xs)] transition-colors',
              tab.id === activeTab
                ? 'bg-[var(--tab-contained-active)] text-text-primary'
                : 'bg-transparent text-text-tertiary hover:text-text-secondary',
            )}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          className="mr-1 flex size-6 items-center justify-center text-text-tertiary hover:text-text-secondary"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse dock' : 'Expand dock'}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>

      {/* Content area — flex-1 fills whatever the panel gives us */}
      <div
        className={cn(
          'min-h-0 overflow-hidden transition-[flex] duration-[var(--duration-slow)] ease-[var(--easing-default)]',
          expanded ? 'flex-1' : 'flex-[0]',
        )}
      >
        <div className="h-full overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export { BottomDock };
export type { BottomDockProps, DockTab };
