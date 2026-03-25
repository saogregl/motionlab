import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Box,
  CircleDot,
  Crosshair,
  Eye,
  Gauge,
  Grid3X3,
  Link2,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useDensity } from '../../hooks/use-density';
import { HotkeysProvider, useHotkey } from '../../hooks/use-keyboard-shortcuts';
import { useTheme } from '../../hooks/use-theme';
import { SelectionChip } from '../engineering/selection-chip';
import { AxisColorLabel } from '../primitives/axis-color-label';
import { DensityToggle } from '../primitives/density-toggle';
import { EmptyState } from '../primitives/empty-state';
import { FloatingToolCard } from '../primitives/floating-tool-card';
import { InspectorPanel } from '../primitives/inspector-panel';
import { InspectorSection } from '../primitives/inspector-section';
import { NumericInput } from '../primitives/numeric-input';
import { PropertyRow } from '../primitives/property-row';
import { StatusBadge } from '../primitives/status-badge';
import { ThemeToggle } from '../primitives/theme-toggle';
import { TimelineScrubber } from '../primitives/timeline-scrubber';
import { TimelineTransport } from '../primitives/timeline-transport';
import { ToolbarButton } from '../primitives/toolbar-button';
import { ToolbarGroup } from '../primitives/toolbar-group';
import { GroupHeaderRow, TreeRow } from '../primitives/tree-row';
import { type TreeNode, TreeView } from '../primitives/tree-view';
import { ViewCube as ViewCubeComponent } from '../primitives/view-cube';
import { ViewportToolbar } from '../primitives/viewport-toolbar';
import { Button } from '../ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Input } from '../ui/input';
import { TooltipProvider } from '../ui/tooltip';

import { AppShell } from './app-shell';
import { BottomDock } from './bottom-dock';
import { LeftPanel } from './left-panel';
import { RightPanel } from './right-panel';
import { TopBar } from './top-bar';
import { ViewportHUD } from './viewport-hud';
import { WorkspaceTabBar } from './workspace-tab-bar';

/* ── Tree data: 30+ nodes ── */

const TREE_NODES: TreeNode[] = [
  // Bodies (8)
  {
    id: 'g-bodies',
    parentId: null,
    level: 0,
    name: 'Bodies',
    hasChildren: true,
    isGroup: true,
    count: 8,
  },
  {
    id: 'b-housing',
    parentId: 'g-bodies',
    level: 1,
    name: 'Housing',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-crankshaft',
    parentId: 'g-bodies',
    level: 1,
    name: 'Crankshaft',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-con-rod',
    parentId: 'g-bodies',
    level: 1,
    name: 'Connecting Rod',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-piston',
    parentId: 'g-bodies',
    level: 1,
    name: 'Piston',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-flywheel',
    parentId: 'g-bodies',
    level: 1,
    name: 'Flywheel',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-cam-shaft',
    parentId: 'g-bodies',
    level: 1,
    name: 'Camshaft',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-rocker-arm',
    parentId: 'g-bodies',
    level: 1,
    name: 'Rocker Arm',
    hasChildren: false,
    entityType: 'body',
  },
  {
    id: 'b-valve',
    parentId: 'g-bodies',
    level: 1,
    name: 'Intake Valve',
    hasChildren: false,
    entityType: 'body',
  },

  // Datums (6)
  {
    id: 'g-datums',
    parentId: null,
    level: 0,
    name: 'Datums',
    hasChildren: true,
    isGroup: true,
    count: 6,
  },
  {
    id: 'd-crank-axis',
    parentId: 'g-datums',
    level: 1,
    name: 'Crank Axis',
    hasChildren: false,
    entityType: 'datum',
  },
  {
    id: 'd-piston-axis',
    parentId: 'g-datums',
    level: 1,
    name: 'Piston Axis',
    hasChildren: false,
    entityType: 'datum',
  },
  {
    id: 'd-cam-axis',
    parentId: 'g-datums',
    level: 1,
    name: 'Cam Axis',
    hasChildren: false,
    entityType: 'datum',
  },
  {
    id: 'd-tdc-plane',
    parentId: 'g-datums',
    level: 1,
    name: 'TDC Plane',
    hasChildren: false,
    entityType: 'datum',
  },
  {
    id: 'd-valve-seat',
    parentId: 'g-datums',
    level: 1,
    name: 'Valve Seat',
    hasChildren: false,
    entityType: 'datum',
  },
  {
    id: 'd-mount-face',
    parentId: 'g-datums',
    level: 1,
    name: 'Mount Face',
    hasChildren: false,
    entityType: 'datum',
  },

  // Joints (10)
  {
    id: 'g-joints',
    parentId: null,
    level: 0,
    name: 'Joints',
    hasChildren: true,
    isGroup: true,
    count: 10,
  },
  {
    id: 'j-crank-main',
    parentId: 'g-joints',
    level: 1,
    name: 'Crank Main Bearing',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'revolute',
  },
  {
    id: 'j-crank-rod',
    parentId: 'g-joints',
    level: 1,
    name: 'Crank–Rod Pin',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'revolute',
  },
  {
    id: 'j-rod-piston',
    parentId: 'g-joints',
    level: 1,
    name: 'Rod–Piston Pin',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'revolute',
  },
  {
    id: 'j-piston-bore',
    parentId: 'g-joints',
    level: 1,
    name: 'Piston–Bore',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'slider',
  },
  {
    id: 'j-flywheel',
    parentId: 'g-joints',
    level: 1,
    name: 'Flywheel Mount',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'fixed',
  },
  {
    id: 'j-cam-bearing',
    parentId: 'g-joints',
    level: 1,
    name: 'Cam Bearing',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'revolute',
  },
  {
    id: 'j-cam-rocker',
    parentId: 'g-joints',
    level: 1,
    name: 'Cam–Rocker',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'cylindrical',
  },
  {
    id: 'j-rocker-pivot',
    parentId: 'g-joints',
    level: 1,
    name: 'Rocker Pivot',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'revolute',
  },
  {
    id: 'j-valve-guide',
    parentId: 'g-joints',
    level: 1,
    name: 'Valve Guide',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'slider',
  },
  {
    id: 'j-housing-fixed',
    parentId: 'g-joints',
    level: 1,
    name: 'Housing Fixed',
    hasChildren: false,
    entityType: 'joint',
    jointType: 'fixed',
  },

  // Drivers (4)
  {
    id: 'g-drivers',
    parentId: null,
    level: 0,
    name: 'Drivers',
    hasChildren: true,
    isGroup: true,
    count: 4,
  },
  {
    id: 'dr-crank-torque',
    parentId: 'g-drivers',
    level: 1,
    name: 'Crank Torque',
    hasChildren: false,
    entityType: 'driver',
  },
  {
    id: 'dr-valve-spring',
    parentId: 'g-drivers',
    level: 1,
    name: 'Valve Spring',
    hasChildren: false,
    entityType: 'driver',
  },
  {
    id: 'dr-friction',
    parentId: 'g-drivers',
    level: 1,
    name: 'Bore Friction',
    hasChildren: false,
    entityType: 'driver',
  },
  {
    id: 'dr-gas-pressure',
    parentId: 'g-drivers',
    level: 1,
    name: 'Gas Pressure',
    hasChildren: false,
    entityType: 'driver',
  },

  // Sensors (2)
  {
    id: 'g-sensors',
    parentId: null,
    level: 0,
    name: 'Sensors',
    hasChildren: true,
    isGroup: true,
    count: 2,
  },
  {
    id: 's-crank-speed',
    parentId: 'g-sensors',
    level: 1,
    name: 'Crank Speed',
    hasChildren: false,
    entityType: 'sensor',
  },
  {
    id: 's-piston-accel',
    parentId: 'g-sensors',
    level: 1,
    name: 'Piston Accel',
    hasChildren: false,
    entityType: 'sensor',
  },
];

/* ── Entity icons ── */

const JOINT_COLORS: Record<string, string> = {
  revolute: 'var(--joint-revolute)',
  slider: 'var(--joint-slider)',
  cylindrical: 'var(--joint-cylindrical)',
  fixed: 'var(--joint-fixed)',
};

function EntityIcon({ type, jointType }: { type: string; jointType?: string }) {
  switch (type) {
    case 'body':
      return <Box className="size-3.5 text-[var(--text-tertiary)]" />;
    case 'datum':
      return <Crosshair className="size-3.5 text-[var(--text-tertiary)]" />;
    case 'joint': {
      const color = JOINT_COLORS[jointType ?? ''] ?? 'var(--text-secondary)';
      switch (jointType) {
        case 'revolute':
          return <RotateCw className="size-3.5 opacity-70" style={{ color }} />;
        case 'slider':
          return <ArrowLeftRight className="size-3.5 opacity-70" style={{ color }} />;
        case 'fixed':
          return <Lock className="size-3.5 opacity-70" style={{ color }} />;
        case 'cylindrical':
          return <CircleDot className="size-3.5 opacity-70" style={{ color }} />;
        default:
          return <Link2 className="size-3.5 opacity-70" style={{ color }} />;
      }
    }
    case 'driver':
      return <Zap className="size-3.5 text-[var(--text-tertiary)]" />;
    case 'sensor':
      return <Gauge className="size-3.5 text-[var(--text-tertiary)]" />;
    default:
      return <Box className="size-3.5 text-[var(--text-tertiary)]" />;
  }
}

/* ── Viewport placeholders ── */

function AxisIndicator() {
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

function ViewCubeWithToolbar() {
  return (
    <div className="flex flex-col items-end gap-1">
      <ViewCubeComponent />
      <ViewportToolbar>
        <ToolbarButton tooltip="Wireframe">
          <Grid3X3 />
        </ToolbarButton>
        <ToolbarButton tooltip="Shaded">
          <Box />
        </ToolbarButton>
        <ToolbarButton tooltip="Visibility">
          <Eye />
        </ToolbarButton>
      </ViewportToolbar>
    </div>
  );
}

/* ── Command palette commands ── */

const COMMANDS = [
  { id: 'create-body', label: 'Create Body' },
  { id: 'create-joint', label: 'Create Joint' },
  { id: 'create-datum', label: 'Create Datum' },
  { id: 'run-simulation', label: 'Run Simulation' },
  { id: 'toggle-grid', label: 'Toggle Grid' },
  { id: 'toggle-wireframe', label: 'Toggle Wireframe' },
  { id: 'export-step', label: 'Export as STEP' },
  { id: 'export-results', label: 'Export Results' },
];

/* ── Main demo component ── */

function MotionLabShellDemo() {
  const { theme, toggleTheme } = useTheme();
  const { density, toggleDensity } = useDensity();

  const [commandOpen, setCommandOpen] = useState(false);
  const [toolCardOpen, setToolCardOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['b-piston']));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['g-bodies', 'g-datums', 'g-joints', 'g-drivers', 'g-sensors']),
  );
  const [activeBottomTab, setActiveBottomTab] = useState('timeline');
  const [bottomExpanded, setBottomExpanded] = useState(true);
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);

  // Timeline state
  const [currentTime, setCurrentTime] = useState(0.342);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = 2.0;
  const stepSize = 1 / 60;

  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);

  // Derive selected entity info
  const selectedNode = useMemo(() => TREE_NODES.find((n) => selectedIds.has(n.id)), [selectedIds]);

  // Keyboard shortcuts
  useHotkey('Mod+K', (e) => {
    e.preventDefault();
    setCommandOpen((o) => !o);
  });
  useHotkey('Escape', () => setCommandOpen(false));
  useHotkey('H', () => console.log('[shortcut] Toggle visibility'));
  useHotkey('I', () => console.log('[shortcut] Isolate selection'));
  useHotkey('F', () => console.log('[shortcut] Focus viewport'));
  useHotkey('Delete', () => console.log('[shortcut] Delete selection'));
  useHotkey('F2', () => console.log('[shortcut] Rename selection'));

  return (
    <HotkeysProvider>
      <TooltipProvider>
        <AppShell
          topBar={
            <TopBar
              projectName="Engine Mechanism"
              status={<StatusBadge status="compiled" />}
              actions={
                <>
                  <ThemeToggle theme={theme} onToggle={toggleTheme} />
                  <DensityToggle density={density} onToggle={toggleDensity} />
                  <Button variant="ghost" size="icon" aria-label="Settings">
                    <Settings />
                  </Button>
                  <div className="flex size-6 items-center justify-center rounded-full bg-bg-muted text-[length:var(--text-2xs)] font-semibold text-text-secondary">
                    ML
                  </div>
                </>
              }
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
              <TreeView
                nodes={TREE_NODES}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                expandedIds={expandedIds}
                onExpandedChange={setExpandedIds}
                renderRow={(node, props) => {
                  if (node.isGroup) {
                    return (
                      <GroupHeaderRow
                        label={node.name}
                        count={node.count as number}
                        level={node.level}
                        expanded={props.expanded}
                        onToggleExpand={props.onToggleExpand}
                      />
                    );
                  }
                  return (
                    <TreeRow
                      level={node.level}
                      name={node.name}
                      icon={
                        <EntityIcon
                          type={node.entityType as string}
                          jointType={node.jointType as string | undefined}
                        />
                      }
                      hasChildren={node.hasChildren}
                      expanded={props.expanded}
                      selected={props.selected}
                      focused={props.focused}
                      onToggleExpand={props.onToggleExpand}
                      onSelect={props.onSelect}
                      onToggleVisibility={() => {}}
                      onContextMenu={() => {}}
                      secondary={node.jointType as string | undefined}
                    />
                  );
                }}
              />
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
                        <select className="h-6 w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none hover:bg-[var(--field-base-hover)] focus:border-[var(--accent-primary)] focus:bg-[var(--layer-base)]">
                          <option>On Face</option>
                          <option>At Point</option>
                        </select>
                      </PropertyRow>
                      <PropertyRow label="Name">
                        <input
                          type="text"
                          defaultValue="Datum_7"
                          className="h-6 w-full rounded-[var(--radius-sm)] ghost-input px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)]"
                        />
                      </PropertyRow>
                    </FloatingToolCard>
                  ) : undefined
                }
                topRight={<ViewCubeWithToolbar />}
                bottomLeft={<AxisIndicator />}
                bottomCenter={
                  selectedNode && !selectedNode.isGroup ? (
                    <SelectionChip
                      icon={
                        <EntityIcon
                          type={selectedNode.entityType as string}
                          jointType={selectedNode.jointType as string | undefined}
                        />
                      }
                      name={selectedNode.name}
                      onClick={() => {}}
                    />
                  ) : undefined
                }
              />
            </div>
          }
          rightPanel={
            <RightPanel>
              {selectedNode && !selectedNode.isGroup ? (
                <InspectorPanel
                  entityName={selectedNode.name}
                  entityType={(selectedNode.entityType as string)?.replace(/^\w/, (c: string) =>
                    c.toUpperCase(),
                  )}
                  entityIcon={
                    <EntityIcon
                      type={selectedNode.entityType as string}
                      jointType={selectedNode.jointType as string | undefined}
                    />
                  }
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
                      <Input
                        defaultValue={selectedNode.name}
                        className="h-6 rounded-[var(--radius-sm)] ghost-input text-[length:var(--text-sm)]"
                      />
                    </PropertyRow>
                    <PropertyRow label="ID">
                      <span className="flex h-6 items-center font-[family-name:var(--font-mono)] text-[length:var(--text-sm)] text-text-tertiary">
                        {selectedNode.id}
                      </span>
                    </PropertyRow>
                  </InspectorSection>
                  <InspectorSection title="Transform">
                    <PropertyRow
                      label={
                        <>
                          <AxisColorLabel axis="x" /> Pos X
                        </>
                      }
                      unit="mm"
                      numeric
                    >
                      <NumericInput value={12.5} step={0.1} precision={3} />
                    </PropertyRow>
                    <PropertyRow
                      label={
                        <>
                          <AxisColorLabel axis="y" /> Pos Y
                        </>
                      }
                      unit="mm"
                      numeric
                    >
                      <NumericInput value={0} step={0.1} precision={3} />
                    </PropertyRow>
                    <PropertyRow
                      label={
                        <>
                          <AxisColorLabel axis="z" /> Pos Z
                        </>
                      }
                      unit="mm"
                      numeric
                    >
                      <NumericInput value={-3.2} step={0.1} precision={3} />
                    </PropertyRow>
                  </InspectorSection>
                  {selectedNode.entityType === 'joint' && (
                    <InspectorSection title="Joint">
                      <PropertyRow label="Type">
                        <span className="flex h-6 items-center text-[length:var(--text-sm)] text-text-primary capitalize">
                          {selectedNode.jointType as string}
                        </span>
                      </PropertyRow>
                      <PropertyRow label="Body A">
                        <span className="flex h-6 items-center text-[length:var(--text-sm)] text-text-primary">
                          Housing
                        </span>
                      </PropertyRow>
                      <PropertyRow label="Body B">
                        <span className="flex h-6 items-center text-[length:var(--text-sm)] text-text-primary">
                          {selectedNode.name.split('–')[0] ?? 'Piston'}
                        </span>
                      </PropertyRow>
                    </InspectorSection>
                  )}
                </InspectorPanel>
              ) : (
                <InspectorPanel />
              )}
            </RightPanel>
          }
          bottomDock={
            <BottomDock
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
              {activeBottomTab === 'charts' && (
                <EmptyState
                  icon={<BarChart3 className="size-10" />}
                  message="No charts configured"
                  hint="Add a sensor output to see charts"
                  className="h-full"
                />
              )}
              {activeBottomTab === 'diagnostics' && (
                <EmptyState
                  icon={<Activity className="size-10" />}
                  message="No diagnostics available"
                  hint="Run a simulation to see diagnostics"
                  className="h-full"
                />
              )}
            </BottomDock>
          }
          tabBar={
            <WorkspaceTabBar
              tabs={[
                { id: 'asm', label: 'Assembly_1', active: true, dirty: true },
                { id: 'sim', label: 'Simulation_1' },
                { id: 'part', label: 'Part Studio 2' },
              ]}
            />
          }
        />

        {/* Command palette */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              {COMMANDS.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  onSelect={() => {
                    console.log('[command]', cmd.label);
                    setCommandOpen(false);
                  }}
                >
                  {cmd.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </TooltipProvider>
    </HotkeysProvider>
  );
}

/* ── Storybook meta ── */

const meta = {
  title: 'Shell/MotionLabShell',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LightComfortable: Story = {
  render: () => <MotionLabShellDemo />,
};

export const DarkComfortable: Story = {
  render: () => <MotionLabShellDemo />,
  decorators: [
    (Story) => {
      document.documentElement.classList.add('dark');
      return <Story />;
    },
  ],
};

export const LightCompact: Story = {
  render: () => <MotionLabShellDemo />,
  decorators: [
    (Story) => {
      document.documentElement.classList.add('compact');
      return <Story />;
    },
  ],
};

export const DarkCompact: Story = {
  render: () => <MotionLabShellDemo />,
  decorators: [
    (Story) => {
      document.documentElement.classList.add('dark', 'compact');
      return <Story />;
    },
  ],
};
