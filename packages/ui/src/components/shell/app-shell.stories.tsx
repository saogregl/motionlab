import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Box,
  BoxSelect,
  Eye,
  Grid3X3,
  Maximize2,
  Move,
  Pointer,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useState } from 'react';

import { InspectorPanel } from '@/components/primitives/inspector-panel';
import { InspectorSection } from '@/components/primitives/inspector-section';
import { PropertyRow } from '@/components/primitives/property-row';
import { StatusBadge } from '@/components/primitives/status-badge';
import { ToolbarButton } from '@/components/primitives/toolbar-button';
import { ToolbarGroup } from '@/components/primitives/toolbar-group';
import { GroupHeaderRow, TreeRow } from '@/components/primitives/tree-row';
import { TreeView, type TreeNode } from '@/components/primitives/tree-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

import { AppShell } from './app-shell';
import { BottomDock } from './bottom-dock';
import { LeftPanel } from './left-panel';
import { RightPanel } from './right-panel';
import { SecondaryToolbar } from './secondary-toolbar';
import { TopBar } from './top-bar';
import { WorkspaceTabBar } from './workspace-tab-bar';

/* ── Sample tree data: Brake Caliper Assembly ── */

const TREE_NODES: TreeNode[] = [
  // Bodies group
  { id: 'g-bodies', parentId: null, level: 0, name: 'Bodies', hasChildren: true, isGroup: true, count: 6 },
  { id: 'b-caliper-housing', parentId: 'g-bodies', level: 1, name: 'Caliper Housing', hasChildren: false, entityType: 'body' },
  { id: 'b-brake-pad-inner', parentId: 'g-bodies', level: 1, name: 'Brake Pad Inner', hasChildren: false, entityType: 'body' },
  { id: 'b-brake-pad-outer', parentId: 'g-bodies', level: 1, name: 'Brake Pad Outer', hasChildren: false, entityType: 'body' },
  { id: 'b-piston', parentId: 'g-bodies', level: 1, name: 'Piston', hasChildren: false, entityType: 'body' },
  { id: 'b-mounting-bracket', parentId: 'g-bodies', level: 1, name: 'Mounting Bracket', hasChildren: false, entityType: 'body' },
  { id: 'b-brake-disc', parentId: 'g-bodies', level: 1, name: 'Brake Disc', hasChildren: false, entityType: 'body' },
  // Datums group
  { id: 'g-datums', parentId: null, level: 0, name: 'Datums', hasChildren: true, isGroup: true, count: 3 },
  { id: 'd-piston-axis', parentId: 'g-datums', level: 1, name: 'Piston Axis', hasChildren: false, entityType: 'datum' },
  { id: 'd-pad-contact', parentId: 'g-datums', level: 1, name: 'Pad Contact Plane', hasChildren: false, entityType: 'datum' },
  { id: 'd-mount-holes', parentId: 'g-datums', level: 1, name: 'Mounting Holes', hasChildren: false, entityType: 'datum' },
  // Joints group
  { id: 'g-joints', parentId: null, level: 0, name: 'Joints', hasChildren: true, isGroup: true, count: 5 },
  { id: 'j-piston-slider', parentId: 'g-joints', level: 1, name: 'Piston Slider', hasChildren: false, entityType: 'joint', jointType: 'slider' },
  { id: 'j-pad-slider-inner', parentId: 'g-joints', level: 1, name: 'Pad Slider Inner', hasChildren: false, entityType: 'joint', jointType: 'slider' },
  { id: 'j-pad-slider-outer', parentId: 'g-joints', level: 1, name: 'Pad Slider Outer', hasChildren: false, entityType: 'joint', jointType: 'slider' },
  { id: 'j-mount-fixed', parentId: 'g-joints', level: 1, name: 'Mount Fixed', hasChildren: false, entityType: 'joint', jointType: 'fixed' },
  { id: 'j-disc-revolute', parentId: 'g-joints', level: 1, name: 'Disc Revolute', hasChildren: false, entityType: 'joint', jointType: 'revolute' },
  // Drivers group
  { id: 'g-drivers', parentId: null, level: 0, name: 'Drivers', hasChildren: true, isGroup: true, count: 1 },
  { id: 'dr-brake-force', parentId: 'g-drivers', level: 1, name: 'Brake Force', hasChildren: false, entityType: 'driver' },
];

/* ── Entity icons ── */

function EntityIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    body: 'text-text-secondary',
    datum: 'text-[var(--axis-z)]',
    joint: 'text-[var(--joint-revolute)]',
    driver: 'text-[var(--status-running)]',
  };
  return <Box className={`size-4 ${colors[type] ?? 'text-text-tertiary'}`} />;
}

/* ── Composed story component ── */

function ComposedAppShell() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['j-disc-revolute']));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['g-bodies', 'g-datums', 'g-joints', 'g-drivers']),
  );

  return (
    <TooltipProvider>
      <AppShell
        topBar={
          <TopBar
            projectName="Brake Caliper Assembly"
            status={<StatusBadge status="compiled" />}
            actions={
              <>
                <Button variant="ghost" size="icon" aria-label="Settings">
                  <Settings />
                </Button>
                <div className="flex size-6 items-center justify-center rounded-full bg-bg-muted text-[length:var(--text-2xs)] font-semibold text-text-secondary">
                  LS
                </div>
              </>
            }
          />
        }
        toolbar={
          <SecondaryToolbar>
            <ToolbarGroup separator>
              <ToolbarButton tooltip="Select" active>
                <Pointer />
              </ToolbarButton>
              <ToolbarButton tooltip="Box Select">
                <BoxSelect />
              </ToolbarButton>
            </ToolbarGroup>
            <ToolbarGroup separator>
              <ToolbarButton tooltip="Move">
                <Move />
              </ToolbarButton>
              <ToolbarButton tooltip="Rotate">
                <RotateCcw />
              </ToolbarButton>
              <ToolbarButton tooltip="Scale">
                <Maximize2 />
              </ToolbarButton>
            </ToolbarGroup>
            <ToolbarGroup>
              <ToolbarButton tooltip="Grid">
                <Grid3X3 />
              </ToolbarButton>
              <ToolbarButton tooltip="Visibility">
                <Eye />
              </ToolbarButton>
            </ToolbarGroup>
          </SecondaryToolbar>
        }
        leftPanel={
          <LeftPanel>
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
                    icon={<EntityIcon type={node.entityType as string} />}
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
          <div className="flex h-full w-full items-center justify-center bg-bg-viewport">
            <span className="text-[length:var(--text-lg)] text-text-tertiary">3D Viewport</span>
          </div>
        }
        rightPanel={
          <RightPanel>
            <InspectorPanel
              entityName="Disc Revolute"
              entityType="Joint"
              entityIcon={<Box className="size-5 text-[var(--joint-revolute)]" />}
              statusLine="Valid"
            >
              <InspectorSection title="Type">
                <PropertyRow label="Joint Type">
                  <span className="text-[length:var(--text-sm)] text-text-primary">Revolute</span>
                </PropertyRow>
                <PropertyRow label="Color">
                  <div className="flex items-center gap-1.5">
                    <span className="size-4 rounded-[var(--radius-sm)] bg-[var(--joint-revolute)]" />
                    <span className="text-[length:var(--text-sm)] text-text-primary">#d4880f</span>
                  </div>
                </PropertyRow>
              </InspectorSection>
              <InspectorSection title="Endpoints">
                <PropertyRow label="Body A">
                  <span className="text-[length:var(--text-sm)] text-text-primary">
                    Mounting Bracket
                  </span>
                </PropertyRow>
                <PropertyRow label="Body B">
                  <span className="text-[length:var(--text-sm)] text-text-primary">Brake Disc</span>
                </PropertyRow>
                <PropertyRow label="Datum A">
                  <span className="text-[length:var(--text-sm)] text-text-primary">Mount Axis</span>
                </PropertyRow>
                <PropertyRow label="Datum B">
                  <span className="text-[length:var(--text-sm)] text-text-primary">Disc Center</span>
                </PropertyRow>
              </InspectorSection>
              <InspectorSection title="Limits">
                <PropertyRow label="Lower" unit="deg" numeric>
                  <Input
                    defaultValue="-180"
                    className="h-6 rounded-[var(--radius-sm)] border-none bg-field-base text-[length:var(--text-sm)] tabular-nums"
                  />
                </PropertyRow>
                <PropertyRow label="Upper" unit="deg" numeric>
                  <Input
                    defaultValue="180"
                    className="h-6 rounded-[var(--radius-sm)] border-none bg-field-base text-[length:var(--text-sm)] tabular-nums"
                  />
                </PropertyRow>
                <PropertyRow label="Stiffness" unit="N*m/rad" numeric>
                  <Input
                    defaultValue="0.0"
                    className="h-6 rounded-[var(--radius-sm)] border-none bg-field-base text-[length:var(--text-sm)] tabular-nums"
                  />
                </PropertyRow>
              </InspectorSection>
            </InspectorPanel>
          </RightPanel>
        }
        bottomDock={
          <BottomDock
            tabs={[
              { id: 'timeline', label: 'Timeline' },
              { id: 'charts', label: 'Charts' },
              { id: 'diagnostics', label: 'Diagnostics' },
              { id: 'console', label: 'Console' },
            ]}
          >
            <div className="flex h-full items-center justify-center bg-layer-recessed text-[length:var(--text-sm)] text-text-tertiary">
              Timeline content
            </div>
          </BottomDock>
        }
        tabBar={
          <WorkspaceTabBar
            tabs={[
              { id: 'asm-1', label: 'Assembly_1', active: true, dirty: true },
              { id: 'part-2', label: 'Part Studio 2' },
              { id: 'sim-1', label: 'Simulation_1' },
            ]}
          />
        }
      />
    </TooltipProvider>
  );
}

/* ── Storybook meta ── */

const meta: Meta = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj;

export const Default: Story = {
  render: () => <ComposedAppShell />,
};
