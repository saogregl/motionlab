import { type ReactNode, useEffect, useRef } from 'react';

import { useLayoutManager, useLayoutRoot } from '../../layout';
import { cn } from '../../lib/utils';
import { FloatingPanel } from './floating-panel';

interface AppShellProps {
  /** Top bar (38px) */
  topBar?: ReactNode;
  /** Left panel content (rendered inside a FloatingPanel) */
  leftPanel?: ReactNode;
  /** Whether the left panel is open */
  leftPanelOpen?: boolean;
  /** Left panel width in px */
  leftPanelWidth?: number;
  /** Callback when left panel is resized */
  onLeftPanelWidthChange?: (width: number) => void;
  /** Right panel content (rendered inside a FloatingPanel) */
  rightPanel?: ReactNode;
  /** Whether the right panel is open */
  rightPanelOpen?: boolean;
  /** Right panel width in px */
  rightPanelWidth?: number;
  /** Callback when right panel is resized */
  onRightPanelWidthChange?: (width: number) => void;
  /** Center viewport (fills main area) */
  viewport?: ReactNode;
  /** Bottom panel (full-width layout row) */
  bottomPanel?: ReactNode;
  /** Whether the bottom panel is expanded */
  bottomPanelExpanded?: boolean;
  /** Additional overlays in the main area (floating toolbars, HUD) */
  viewportOverlays?: ReactNode;
  /** Workspace tab bar (28px, bottom of screen) */
  tabBar?: ReactNode;
  /** Status bar (24px, very bottom of window) */
  statusBar?: ReactNode;
  className?: string;
}

const DEFAULT_PANEL_W = 288;

function AppShell({
  topBar,
  leftPanel,
  leftPanelOpen = true,
  leftPanelWidth,
  onLeftPanelWidthChange,
  rightPanel,
  rightPanelOpen = true,
  rightPanelWidth,
  onRightPanelWidthChange,
  viewport,
  bottomPanel,
  viewportOverlays,
  tabBar,
  statusBar,
  className,
}: AppShellProps) {
  const layoutRef = useLayoutRoot();
  const manager = useLayoutManager();
  const bottomContainerRef = useRef<HTMLDivElement>(null);
  const hasBottomPanel = !!bottomPanel;

  useEffect(() => {
    const el = bottomContainerRef.current;
    if (!el || !hasBottomPanel) {
      manager.removeSlot('panel-bottom');
      return;
    }
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      manager.updateSlot({ id: 'panel-bottom', side: 'bottom', size: h, open: h > 0 });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      manager.removeSlot('panel-bottom');
    };
  }, [manager, hasBottomPanel]);

  return (
    <div
      data-slot="app-shell"
      className={cn(
        'flex h-screen w-screen flex-col overflow-hidden bg-bg-app font-[family-name:var(--font-ui)] text-[length:var(--text-base)] text-text-primary',
        className,
      )}
    >
      {/* Row 1: Top bar */}
      {topBar}

      {/* Row 2: Main area — viewport + floating panels */}
      <div
        ref={layoutRef}
        data-slot="main-area"
        className="relative flex-1 overflow-hidden"
      >
        {/* Viewport layer */}
        <div className="absolute inset-0 z-[var(--z-base)]">{viewport}</div>

        {/* Left floating panel */}
        {leftPanel && (
          <FloatingPanel
            side="left"
            open={leftPanelOpen}
            width={leftPanelWidth}
            onWidthChange={onLeftPanelWidthChange}
          >
            {leftPanel}
          </FloatingPanel>
        )}

        {/* Right floating panel */}
        {rightPanel && (
          <FloatingPanel
            side="right"
            open={rightPanelOpen}
            width={rightPanelWidth}
            onWidthChange={onRightPanelWidthChange}
          >
            {rightPanel}
          </FloatingPanel>
        )}

        {/* Bottom floating panel */}
        {bottomPanel && (
          <div
            ref={bottomContainerRef}
            data-slot="bottom-panel-container"
            className="absolute z-[var(--z-panel)]"
            style={{
              bottom: 'var(--panel-float-inset)',
              left: 'var(--panel-float-inset)',
              right: 'var(--panel-float-inset)',
            }}
          >
            {bottomPanel}
          </div>
        )}

        {/* Additional overlays (floating toolbars, HUD, etc.) */}
        {viewportOverlays}
      </div>

      {/* Row 4: Workspace tab bar */}
      {tabBar}

      {/* Row 5: Status bar */}
      {statusBar}
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
