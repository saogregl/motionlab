import type { Meta, StoryObj } from '@storybook/react-vite';

import { AxisColorLabel } from './axis-color-label';

function AxisColorLabelDemo() {
  return (
    <div className="flex items-center gap-4 p-4 bg-layer-base">
      <div className="flex items-center gap-1.5">
        <AxisColorLabel axis="x" />
        <span className="text-[length:var(--text-xs)] text-[var(--text-primary)]">Position X</span>
      </div>
      <div className="flex items-center gap-1.5">
        <AxisColorLabel axis="y" />
        <span className="text-[length:var(--text-xs)] text-[var(--text-primary)]">Position Y</span>
      </div>
      <div className="flex items-center gap-1.5">
        <AxisColorLabel axis="z" />
        <span className="text-[length:var(--text-xs)] text-[var(--text-primary)]">Position Z</span>
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/AxisColorLabel',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <AxisColorLabelDemo />,
};

export const Dark: Story = {
  render: () => <AxisColorLabelDemo />,
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};
