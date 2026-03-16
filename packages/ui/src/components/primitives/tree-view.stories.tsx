import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, CircleDot, Crosshair, Link2 } from 'lucide-react';
import { useState } from 'react';
import { GroupHeaderRow, TreeRow } from './tree-row';
import { TreeView, type TreeNode, type TreeRowRenderProps } from './tree-view';

const meta = {
  title: 'Primitives/TreeView',
  component: TreeView,
  parameters: { layout: 'padded' },
  args: {
    nodes: [],
    selectedIds: new Set<string>(),
    onSelectionChange: () => {},
    renderRow: () => null,
  },
} satisfies Meta<typeof TreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Sample data: ~50 nodes across Bodies, Datums, Joints ── */

function makeNodes(): TreeNode[] {
  const nodes: TreeNode[] = [];
  let id = 0;

  const bodyNames = [
    'Crankshaft',
    'Connecting Rod',
    'Piston',
    'Cylinder Block',
    'Flywheel',
    'Camshaft',
    'Rocker Arm',
    'Valve Spring',
    'Intake Valve',
    'Exhaust Valve',
    'Timing Belt',
    'Oil Pump',
    'Water Pump',
    'Alternator Housing',
    'Starter Motor',
  ];
  const datumNames = [
    'Origin',
    'Crank Center',
    'TDC Plane',
    'BDC Plane',
    'Cam Axis',
    'Valve Plane',
    'Exhaust Port',
    'Intake Port',
    'Oil Gallery',
    'Coolant Passage',
  ];
  const jointNames = [
    'Crank Revolute',
    'ConRod Big End',
    'ConRod Small End',
    'Piston Slider',
    'Cam Revolute',
    'Valve Slider A',
    'Valve Slider B',
    'Timing Belt Contact',
    'Flywheel Fixed',
    'Oil Pump Gear',
    'Water Pump Drive',
    'Alternator Belt',
    'Starter Engage',
    'Rocker Pivot',
    'Spring Seat',
  ];

  // Bodies group
  const bodiesGroupId = String(id++);
  nodes.push({
    id: bodiesGroupId,
    parentId: null,
    level: 0,
    name: 'Bodies',
    hasChildren: true,
    _type: 'group',
    _count: bodyNames.length,
  });
  for (const name of bodyNames) {
    const bodyId = String(id++);
    nodes.push({
      id: bodyId,
      parentId: bodiesGroupId,
      level: 1,
      name,
      hasChildren: true,
      _type: 'body',
    });
    // Each body has 2 datum children
    nodes.push({
      id: String(id++),
      parentId: bodyId,
      level: 2,
      name: 'Center of Mass',
      hasChildren: false,
      _type: 'datum',
    });
    nodes.push({
      id: String(id++),
      parentId: bodyId,
      level: 2,
      name: 'Origin',
      hasChildren: false,
      _type: 'datum',
    });
  }

  // Datums group
  const datumsGroupId = String(id++);
  nodes.push({
    id: datumsGroupId,
    parentId: null,
    level: 0,
    name: 'Datums',
    hasChildren: true,
    _type: 'group',
    _count: datumNames.length,
  });
  for (const name of datumNames) {
    nodes.push({
      id: String(id++),
      parentId: datumsGroupId,
      level: 1,
      name,
      hasChildren: false,
      _type: 'datum',
    });
  }

  // Joints group
  const jointsGroupId = String(id++);
  nodes.push({
    id: jointsGroupId,
    parentId: null,
    level: 0,
    name: 'Joints',
    hasChildren: true,
    _type: 'group',
    _count: jointNames.length,
  });
  for (const name of jointNames) {
    nodes.push({
      id: String(id++),
      parentId: jointsGroupId,
      level: 1,
      name,
      hasChildren: false,
      _type: 'joint',
    });
  }

  return nodes;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  body: <Box className="size-4 text-[var(--text-tertiary)]" />,
  datum: <CircleDot className="size-4 text-[var(--text-tertiary)]" />,
  joint: <Link2 className="size-4 text-[var(--joint-revolute)]" />,
};

function renderRow(node: TreeNode, props: TreeRowRenderProps) {
  const nodeType = node._type as string;

  if (nodeType === 'group') {
    return (
      <GroupHeaderRow
        label={node.name}
        count={node._count as number}
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
      icon={ICON_MAP[nodeType]}
      hasChildren={node.hasChildren}
      expanded={props.expanded}
      selected={props.selected}
      focused={props.focused}
      onToggleExpand={props.onToggleExpand}
      onSelect={props.onSelect}
      onToggleVisibility={() => {}}
      onContextMenu={() => {}}
    />
  );
}

function TreeViewDemo() {
  const [nodes] = useState(makeNodes);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (n._type === 'group') ids.add(n.id);
    }
    return ids;
  });

  return (
    <div className="h-[400px] w-[260px] bg-[var(--bg-panel)]">
      <TreeView
        nodes={nodes}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        expandedIds={expandedIds}
        onExpandedChange={setExpandedIds}
        renderRow={renderRow}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <TreeViewDemo />,
};
