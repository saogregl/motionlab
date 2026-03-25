import type { ReactNode } from 'react';

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
  /** Bottom dock (floating, centered between panels) */
  bottomDock?: ReactNode;
  /** Whether the bottom dock is expanded (controls --vp-inset-bottom) */
  bottomDockExpanded?: boolean;
  /** Additional overlays in the main area (floating toolbars, HUD) */
  viewportOverlays?: ReactNode;
  /** Workspace tab bar (28px, bottom of screen) */
  tabBar?: ReactNode;
  /** Status bar (24px, very bottom of window) */
  statusBar?: ReactNode;
  className?: string;
}

const PANEL_FLOAT_INSET = 6;
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
  bottomDock,
  bottomDockExpanded = true,
  viewportOverlays,
  tabBar,
  statusBar,
  className,
}: AppShellProps) {
  const effectiveLeftW = leftPanelOpen ? (leftPanelWidth ?? DEFAULT_PANEL_W) : 0;
  const effectiveRightW = rightPanelOpen ? (rightPanelWidth ?? DEFAULT_PANEL_W) : 0;

  // Bottom dock inset: expanded uses default dock height (240px), collapsed uses tab bar (~32px)
  const bottomDockInset = bottomDock
    ? PANEL_FLOAT_INSET + (bottomDockExpanded ? 240 : 32) + PANEL_FLOAT_INSET
    : 0;

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
        data-slot="main-area"
        className="relative flex-1 overflow-hidden"
        style={{
          '--vp-inset-left': `${effectiveLeftW ? effectiveLeftW + 2 * PANEL_FLOAT_INSET : 0}px`,
          '--vp-inset-right': `${effectiveRightW ? effectiveRightW + 2 * PANEL_FLOAT_INSET : 0}px`,
          '--vp-inset-bottom': `${bottomDockInset}px`,
        } as React.CSSProperties}
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

        {/* Bottom dock — floating, centered between panels */}
        {bottomDock && (
          <div
            data-slot="bottom-dock-container"
            className="absolute z-[var(--z-panel)]"
            style={{
              bottom: PANEL_FLOAT_INSET,
              left: effectiveLeftW + 2 * PANEL_FLOAT_INSET,
              right: effectiveRightW + 2 * PANEL_FLOAT_INSET,
            }}
          >
            {bottomDock}
          </div>
        )}

        {/* Additional overlays (floating toolbars, HUD, etc.) */}
        {viewportOverlays}
      </div>

      {/* Row 3: Workspace tab bar (optional, wired in Epic 3) */}
      {tabBar}

      {/* Row 4: Status bar */}
      {statusBar}
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
