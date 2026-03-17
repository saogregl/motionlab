import type { Meta, StoryObj } from '@storybook/react-vite';
import { PropertyRow } from './property-row';

const meta = {
  title: 'Primitives/PropertyRow',
  component: PropertyRow,
  parameters: { layout: 'padded' },
  args: {
    label: 'Label',
    children: 'Value',
  },
} satisfies Meta<typeof PropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Name">
        <input
          type="text"
          defaultValue="Crank Arm"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
    </div>
  ),
};

export const NumberWithUnit: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Mass" unit="kg" numeric showReset onReset={() => {}}>
        <input
          type="number"
          defaultValue="12.450"
          step="0.001"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
    </div>
  ),
};

export const SelectDropdown: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Material">
        <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]">
          <option>Steel (AISI 1045)</option>
          <option>Aluminum (6061-T6)</option>
          <option>Titanium (Ti-6Al-4V)</option>
        </select>
      </PropertyRow>
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Volume" unit="mm³" numeric>
        <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
          1,247.83
        </span>
      </PropertyRow>
    </div>
  ),
};

export const WithWarning: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Density" unit="g/cm³" numeric warning="Value exceeds typical range">
        <input
          type="number"
          defaultValue="99.9"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--warning)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
    </div>
  ),
};

export const WithReset: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Position X" unit="mm" numeric showReset onReset={() => {}}>
        <input
          type="number"
          defaultValue="42.000"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="w-[320px] bg-[var(--layer-base)] p-1">
      <PropertyRow label="Name">
        <input
          type="text"
          defaultValue="Crankshaft"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
      <PropertyRow label="Mass" unit="kg" numeric showReset onReset={() => {}}>
        <input
          type="number"
          defaultValue="3.250"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
      <PropertyRow label="Volume" unit="mm³" numeric>
        <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
          412.75
        </span>
      </PropertyRow>
      <PropertyRow label="Density" unit="g/cm³" numeric warning="Exceeds range">
        <input
          type="number"
          defaultValue="99.9"
          className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--warning)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
        />
      </PropertyRow>
      <PropertyRow label="Material">
        <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
          <option>Steel (AISI 1045)</option>
        </select>
      </PropertyRow>
    </div>
  ),
};
