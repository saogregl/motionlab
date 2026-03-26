import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';

import { cn } from '../../lib/utils';

interface DockTab {
  id: string;
  label: string;
}

interface BottomPanelProps {
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
  /** Inline styles (useful for overriding --bottom-panel-h) */
  style?: React.CSSProperties;
}

function BottomPanel({
  tabs,
  activeTab: controlledActiveTab,
  onTabChange,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  className,
  style,
}: BottomPanelProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(tabs[0]?.id ?? '');
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(true);

  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const setActiveTab = onTabChange ?? setUncontrolledActiveTab;
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded;

  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    if (!expanded) return;
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    dragStartRef.current = { startY: e.clientY, startHeight: panel.offsetHeight };
    setIsResizing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [expanded]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    const { startY, startHeight } = dragStartRef.current;
    const delta = startY - e.clientY; // dragging up = larger
    const cs = getComputedStyle(panel);
    const min = parseInt(cs.getPropertyValue('--bottom-panel-min'), 10) || 160;
    const max = parseInt(cs.getPropertyValue('--bottom-panel-max'), 10) || 400;
    const newH = Math.round(Math.min(max, Math.max(min, startHeight + delta)));
    // Direct DOM mutation — ResizeObserver in AppShell picks this up
    panel.style.height = `${newH}px`;
  }, []);

  const handleResizePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setIsResizing(false);
  }, []);

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
      ref={panelRef}
      data-slot="bottom-panel"
      data-expanded={expanded || undefined}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border-default)] bg-layer-base',
        expanded ? 'h-[var(--bottom-panel-h)]' : 'h-auto',
        className,
      )}
      style={style}
    >
      {/* Resize handle — top edge, only when expanded */}
      {expanded && (
        <div
          data-slot="bottom-panel-resize-handle"
          className={cn(
            'absolute inset-x-0 top-0 z-10 h-2 -translate-y-1/2 cursor-row-resize',
            isResizing ? 'bg-accent-primary/20' : 'bg-transparent hover:bg-accent-primary/10',
          )}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
        />
      )}

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
          aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>

      {/* Content area — only rendered when expanded */}
      {expanded && (
        <div className="min-h-0 flex-1 overflow-auto">
          {children}
        </div>
      )}
    </div>
  );
}

export { BottomPanel };
export type { BottomPanelProps, DockTab };
