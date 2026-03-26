import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Crosshair, Link2, MoreHorizontal, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { SelectionChip } from '../engineering/selection-chip';
import { BodyContextMenu } from '../primitives/context-menus';
import { FloatingToolCard } from '../primitives/floating-tool-card';
import { InspectorPanel } from '../primitives/inspector-panel';
import { InspectorSection } from '../primitives/inspector-section';
import { PropertyRow } from '../primitives/property-row';
import { StatusBadge } from '../primitives/status-badge';
import { TimelineScrubber } from '../primitives/timeline-scrubber';
import { TimelineTransport } from '../primitives/timeline-transport';
import { GroupHeaderRow, TreeRow } from '../primitives/tree-row';
import { Button } from '../ui/button';
import { TooltipProvider } from '../ui/tooltip';

import { LayoutProvider } from '../../layout';
import { AppShell } from './app-shell';
import { BottomPanel } from './bottom-panel';
import { LeftPanel } from './left-panel';
import { RightPanel } from './right-panel';
import { TopBar } from './top-bar';
import { ViewportHUD } from './viewport-hud';
import { WorkspaceTabBar } from './workspace-tab-bar';

const meta: Meta = {
  title: 'Shell/AppShellWithTools',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <LayoutProvider>
        <Story />
      </LayoutProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Axis indicator placeholder ── */

function AxisIndicatorPlaceholder() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <title>Axis indicator</title>
      <line x1="8" y1="36" x2="40" y2="36" stroke="var(--axis-x)" strokeWidth="2" />
      <text x="42" y="38" fill="var(--axis-x)" fontSize="10" fontWeight="600">
        X
      </text>
      <line x1="8" y1="36" x2="8" y2="4" stroke="var(--axis-y)" strokeWidth="2" />
      <text x="4" y="2" fill="var(--axis-y)" fontSize="10" fontWeight="600">
        Y
      </text>
      <line x1="8" y1="36" x2="24" y2="20" stroke="var(--axis-z)" strokeWidth="2" />
      <text x="26" y="18" fill="var(--axis-z)" fontSize="10" fontWeight="600">
        Z
      </text>
    </svg>
  );
}

/* ── Main story ── */

function FullIntegrationDemo() {
  const [toolCardOpen, setToolCardOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(0.342);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedBody, setSelectedBody] = useState('Caliper Arm');
  const [bodiesExpanded, setBodiesExpanded] = useState(true);
  const [jointsExpanded, setJointsExpanded] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState('timeline');
  const [bottomExpanded, setBottomExpanded] = useState(true);
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const duration = 2.0;
  const stepSize = 1 / 60;

  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);

  return (
    <TooltipProvider>
      <AppShell
        topBar={
          <TopBar
            projectName="Water Pump Assembly"
            status={<StatusBadge status="compiled" />}
          />
        }
        leftPanelOpen
        leftPanelWidth={leftWidth}
        onLeftPanelWidthChange={setLeftWidth}
        rightPanelOpen
        rightPanelWidth={rightWidth}
        onRightPanelWidthChange={setRightWidth}
        leftPanel={
          <LeftPanel
            createAction={
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-[var(--panel-radius)] bg-layer-raised text-text-tertiary hover:text-text-primary hover:bg-layer-raised-hover"
              >
                <Plus className="size-3.5" />
              </button>
            }
          >
            <div className="py-1">
              <GroupHeaderRow
                label="Bodies"
                count={4}
                expanded={bodiesExpanded}
                onToggleExpand={() => setBodiesExpanded((e) => !e)}
              />
              {bodiesExpanded && (
                <>
                  <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                    <TreeRow
                      level={1}
                      name="Caliper Arm"
                      icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
                      selected={selectedBody === 'Caliper Arm'}
                      focused={selectedBody === 'Caliper Arm'}
                      onSelect={() => setSelectedBody('Caliper Arm')}
                      onToggleVisibility={() => {}}
                      onContextMenu={() => {}}
                    />
                  </BodyContextMenu>
                  <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                    <TreeRow
                      level={1}
                      name="Piston"
                      icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
                      selected={selectedBody === 'Piston'}
                      onSelect={() => setSelectedBody('Piston')}
                      onToggleVisibility={() => {}}
                      onContextMenu={() => {}}
                    />
                  </BodyContextMenu>
                  <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                    <TreeRow
                      level={1}
                      name="Housing"
                      icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
                      selected={selectedBody === 'Housing'}
                      onSelect={() => setSelectedBody('Housing')}
                      onToggleVisibility={() => {}}
                      onContextMenu={() => {}}
                    />
                  </BodyContextMenu>
                  <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                    <TreeRow
                      level={1}
                      name="Impeller"
                      icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
                      selected={selectedBody === 'Impeller'}
                      onSelect={() => setSelectedBody('Impeller')}
                      onToggleVisibility={() => {}}
                      onContextMenu={() => {}}
                    />
                  </BodyContextMenu>
                </>
              )}

              <GroupHeaderRow
                label="Joints"
                count={3}
                expanded={jointsExpanded}
                onToggleExpand={() => setJointsExpanded((e) => !e)}
              />
              {jointsExpanded && (
                <>
                  <TreeRow
                    level={1}
                    name="Rev_1"
                    icon={<Link2 className="size-3.5 text-[var(--joint-revolute)] opacity-70" />}
                    secondary="Revolute"
                    onSelect={() => {}}
                  />
                  <TreeRow
                    level={1}
                    name="Rev_2"
                    icon={<Link2 className="size-3.5 text-[var(--joint-revolute)] opacity-70" />}
                    secondary="Revolute"
                    onSelect={() => {}}
                  />
                  <TreeRow
                    level={1}
                    name="Fixed_1"
                    icon={<Link2 className="size-3.5 text-[var(--joint-fixed)] opacity-70" />}
                    secondary="Fixed"
                    onSelect={() => {}}
                  />
                </>
              )}
            </div>
          </LeftPanel>
        }
        viewport={
          <div className="relative flex h-full w-full items-center justify-center bg-bg-viewport">
            <span className="text-[length:var(--text-lg)] text-text-tertiary">3D Viewport</span>
            <ViewportHUD
              topLeft={
                toolCardOpen ? (
                  <FloatingToolCard
                    icon={<Crosshair className="size-4" />}
                    title="Create Datum"
                    onClose={() => setToolCardOpen(false)}
                    footer={
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setToolCardOpen(false)}>
                          Cancel
                        </Button>
                        <Button size="sm">Confirm</Button>
                      </>
                    }
                  >
                    <PropertyRow label="Mode">
                      <select className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]">
                        <option>On Face</option>
                        <option>At Point</option>
                      </select>
                    </PropertyRow>
                    <PropertyRow label="Name">
                      <input
                        type="text"
                        defaultValue="Datum_4"
                        className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                      />
                    </PropertyRow>
                  </FloatingToolCard>
                ) : undefined
              }
              bottomLeft={<AxisIndicatorPlaceholder />}
              bottomCenter={
                <SelectionChip
                  icon={<Box className="size-3.5 text-[var(--accent-text)]" />}
                  name={selectedBody}
                  onClick={() => {}}
                />
              }
            />
          </div>
        }
        rightPanel={
          <RightPanel>
            <InspectorPanel
              entityName={selectedBody}
              entityType="Body"
              entityIcon={<Box className="size-5" />}
              statusLine="Compiled"
              quickActions={
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontal />
                </Button>
              }
              footer={
                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--panel-radius)] border border-[var(--border-strong)] bg-layer-raised text-[length:var(--text-xs)] font-bold text-text-primary hover:bg-layer-raised-hover"
                >
                  <Plus className="size-3" />
                  Add Component
                </button>
              }
            >
              <InspectorSection title="Identity">
                <PropertyRow label="Name">
                  <input
                    type="text"
                    defaultValue={selectedBody}
                    className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                </PropertyRow>
                <PropertyRow label="Source">
                  <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)]">
                    imported_asm.step
                  </span>
                </PropertyRow>
              </InspectorSection>
              <InspectorSection title="Transform">
                <PropertyRow label="Position X" unit="mm" numeric>
                  <input
                    type="number"
                    defaultValue="12.500"
                    className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                  />
                </PropertyRow>
                <PropertyRow label="Position Y" unit="mm" numeric>
                  <input
                    type="number"
                    defaultValue="0.000"
                    className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                  />
                </PropertyRow>
                <PropertyRow label="Position Z" unit="mm" numeric>
                  <input
                    type="number"
                    defaultValue="-3.200"
                    className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--layer-raised)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                  />
                </PropertyRow>
              </InspectorSection>
            </InspectorPanel>
          </RightPanel>
        }
        bottomPanel={
          <BottomPanel
            tabs={[
              { id: 'timeline', label: 'Timeline' },
              { id: 'charts', label: 'Charts' },
              { id: 'diagnostics', label: 'Diagnostics' },
            ]}
            activeTab={activeBottomTab}
            onTabChange={setActiveBottomTab}
            expanded={bottomExpanded}
            onExpandedChange={setBottomExpanded}
          >
            {activeBottomTab === 'timeline' && (
              <div className="flex flex-col">
                <TimelineTransport
                  isPlaying={isPlaying}
                  isLooping={isLooping}
                  speed={speed}
                  currentTime={currentTime}
                  duration={duration}
                  onPlayPause={() => setIsPlaying((p) => !p)}
                  onStepForward={() => setCurrentTime((t) => Math.min(duration, t + stepSize))}
                  onStepBack={() => setCurrentTime((t) => Math.max(0, t - stepSize))}
                  onSkipForward={() => setCurrentTime(duration)}
                  onSkipBack={() => setCurrentTime(0)}
                  onLoopToggle={() => setIsLooping((l) => !l)}
                  onSpeedChange={setSpeed}
                />
                <div className="px-2 pb-2">
                  <TimelineScrubber
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={handleSeek}
                    tickInterval={0.2}
                  />
                </div>
              </div>
            )}
          </BottomPanel>
        }
        tabBar={
          <WorkspaceTabBar
            tabs={[
              { id: 'asm', label: 'Assembly_1', active: true, dirty: true },
              { id: 'sim', label: 'Simulation_1' },
            ]}
          />
        }
      />
    </TooltipProvider>
  );
}

export const FullIntegration: Story = {
  render: () => <FullIntegrationDemo />,
};
