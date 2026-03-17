import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, CircleDot, Crosshair, Link2 } from 'lucide-react';
import { GroupHeaderRow, TreeRow } from './tree-row';

const meta = {
  title: 'Primitives/TreeRow',
  component: TreeRow,
  parameters: { layout: 'padded' },
  args: {
    level: 0,
    name: 'Item',
  },
} satisfies Meta<typeof TreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    level: 0,
    name: 'Crank Arm',
    icon: <Box className="size-3.5 text-[var(--text-tertiary)]" />,
    hasChildren: false,
    onSelect: () => {},
    onToggleVisibility: () => {},
    onContextMenu: () => {},
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="w-[260px] bg-[var(--layer-base)]">
      <TreeRow
        level={0}
        name="Default"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        hasChildren
        expanded
        onToggleExpand={() => {}}
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onContextMenu={() => {}}
      />
      <TreeRow
        level={1}
        name="Selected"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        selected
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onContextMenu={() => {}}
      />
      <TreeRow
        level={1}
        name="Selected + Focused"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        selected
        focused
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onContextMenu={() => {}}
      />
      <TreeRow
        level={1}
        name="Disabled"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        disabled
        onSelect={() => {}}
      />
      <TreeRow
        level={1}
        name="Drag Target"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        dragTarget
        onSelect={() => {}}
      />
      <TreeRow
        level={1}
        name="With Warning"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        status="warning"
        secondary="12.5 kg"
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onContextMenu={() => {}}
      />
      <TreeRow
        level={1}
        name="With Danger"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        status="danger"
        onSelect={() => {}}
      />
      <TreeRow
        level={1}
        name="Hidden"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        hidden
        onSelect={() => {}}
        onToggleVisibility={() => {}}
      />
      <TreeRow
        level={1}
        name="Selected + Inactive (unfocused)"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        selected
        onSelect={() => {}}
      />
    </div>
  ),
};

export const IndentLevels: Story = {
  render: () => (
    <div className="w-[260px] bg-[var(--layer-base)]">
      <TreeRow
        level={0}
        name="Root Assembly"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        hasChildren
        expanded
        onToggleExpand={() => {}}
        onSelect={() => {}}
      />
      <TreeRow
        level={1}
        name="Crankshaft"
        icon={<Link2 className="size-3.5 text-[var(--joint-revolute)] opacity-70" />}
        hasChildren
        expanded
        onToggleExpand={() => {}}
        onSelect={() => {}}
      />
      <TreeRow
        level={2}
        name="Bearing A"
        icon={<CircleDot className="size-3.5 text-[var(--text-tertiary)]" />}
        secondary="Origin"
        onSelect={() => {}}
      />
      <TreeRow
        level={2}
        name="Bearing B"
        icon={<CircleDot className="size-3.5 text-[var(--text-tertiary)]" />}
        secondary="Origin"
        onSelect={() => {}}
      />
      <TreeRow
        level={1}
        name="Connecting Rod"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        hasChildren
        onToggleExpand={() => {}}
        onSelect={() => {}}
      />
    </div>
  ),
};

export const GroupHeader: Story = {
  render: () => (
    <div className="w-[260px] bg-[var(--layer-base)]">
      <GroupHeaderRow label="Bodies" count={4} expanded onToggleExpand={() => {}} />
      <TreeRow
        level={1}
        name="Crank Arm"
        icon={<Box className="size-3.5 text-[var(--text-tertiary)]" />}
        onSelect={() => {}}
      />
      <GroupHeaderRow label="Datums" count={2} expanded onToggleExpand={() => {}} />
      <TreeRow
        level={1}
        name="Origin"
        icon={<Crosshair className="size-3.5 text-[var(--text-tertiary)]" />}
        onSelect={() => {}}
      />
      <GroupHeaderRow label="Joints" count={0} onToggleExpand={() => {}} />
    </div>
  ),
};
