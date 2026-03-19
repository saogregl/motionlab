import type { ReactNode } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

import { cn } from '../../lib/utils';

interface AppShellProps {
  /** Top bar (44px) */
  topBar?: ReactNode;
  /** Secondary toolbar (36px) */
  toolbar?: ReactNode;
  /** Left panel (resizable, 260px default) */
  leftPanel?: ReactNode;
  /** Center viewport (flex) */
  viewport?: ReactNode;
  /** Right panel / inspector (resizable, 320px default) */
  rightPanel?: ReactNode;
  /** Bottom dock (collapsible, inside center column) */
  bottomDock?: ReactNode;
  /** Workspace tab bar (32px, bottom of screen) */
  tabBar?: ReactNode;
  className?: string;
}

function AppShell({
  topBar,
  toolbar,
  leftPanel,
  viewport,
  rightPanel,
  bottomDock,
  tabBar,
  className,
}: AppShellProps) {
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

      {/* Row 2: Secondary toolbar */}
      {toolbar}

      {/* Row 3: Resizable body */}
      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        {/* Left panel */}
        <Panel
          id="left"
          defaultSize={260}
          minSize={200}
          maxSize={380}
          collapsible
          className="overflow-hidden"
        >
          {leftPanel}
        </Panel>

        <PanelResizeHandle
          className={cn(
            'w-1 shrink-0 bg-transparent transition-colors duration-[var(--duration-fast)]',
            'hover:bg-accent-primary/30',
            'data-[resize-handle-state=drag]:bg-accent-primary',
          )}
        />

        {/* Center column: viewport + resizable bottom dock */}
        <Panel id="center" className="overflow-hidden">
          <PanelGroup orientation="vertical">
            <Panel id="viewport" defaultSize={70} minSize={30}>
              <div className="relative h-full overflow-hidden">{viewport}</div>
            </Panel>
            {bottomDock && (
              <>
                <PanelResizeHandle
                  className={cn(
                    'h-1 shrink-0 bg-transparent transition-colors duration-[var(--duration-fast)]',
                    'hover:bg-accent-primary/30',
                    'data-[resize-handle-state=drag]:bg-accent-primary',
                  )}
                />
                <Panel id="bottom" defaultSize={30} minSize={10} maxSize={60} collapsible>
                  {bottomDock}
                </Panel>
              </>
            )}
          </PanelGroup>
        </Panel>

        <PanelResizeHandle
          className={cn(
            'w-1 shrink-0 bg-transparent transition-colors duration-[var(--duration-fast)]',
            'hover:bg-accent-primary/30',
            'data-[resize-handle-state=drag]:bg-accent-primary',
          )}
        />

        {/* Right panel */}
        <Panel
          id="right"
          defaultSize={320}
          minSize={280}
          maxSize={440}
          collapsible
          className="overflow-hidden"
        >
          {rightPanel}
        </Panel>
      </PanelGroup>

      {/* Row 4: Workspace tab bar */}
      {tabBar}
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
