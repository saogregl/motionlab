import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { NumericInput } from './numeric-input';

function NumericInputDemo() {
  const [val1, setVal1] = useState(12.5);
  const [val2, setVal2] = useState(0);
  const [val3, setVal3] = useState(45);

  return (
    <div className="flex flex-col gap-4 p-4 bg-layer-base w-60">
      <div>
        <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] mb-1 block">
          Position (mm)
        </span>
        <NumericInput value={val1} onChange={setVal1} step={0.1} precision={3} unit="mm" />
      </div>
      <div>
        <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] mb-1 block">
          Rotation (deg)
        </span>
        <NumericInput
          value={val2}
          onChange={setVal2}
          step={1}
          precision={1}
          unit="°"
          min={-360}
          max={360}
        />
      </div>
      <div>
        <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] mb-1 block">
          Angle
        </span>
        <NumericInput value={val3} onChange={setVal3} step={5} precision={0} />
      </div>
      <div>
        <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] mb-1 block">
          Disabled
        </span>
        <NumericInput value={0} disabled />
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/NumericInput',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <NumericInputDemo />,
};

export const Dark: Story = {
  render: () => <NumericInputDemo />,
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};
