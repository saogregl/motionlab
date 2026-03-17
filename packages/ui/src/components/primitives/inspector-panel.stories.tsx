import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { InspectorSection } from './inspector-section';
import { InspectorPanel } from './inspector-panel';
import { PropertyRow } from './property-row';

const meta = {
  title: 'Primitives/InspectorPanel',
  component: InspectorPanel,
  parameters: { layout: 'padded' },
  args: {},
} satisfies Meta<typeof InspectorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  render: () => (
    <div className="h-[400px] w-[320px] border border-[var(--border-default)] bg-[var(--layer-base)]">
      <InspectorPanel />
    </div>
  ),
};

export const BodyInspector: Story = {
  render: () => (
    <div className="h-[500px] w-[320px] border border-[var(--border-default)] bg-[var(--layer-base)]">
      <InspectorPanel
        entityName="Crankshaft"
        entityType="Body"
        entityIcon={<Box className="size-5" />}
        statusLine="Compiled · 3 datums"
        quickActions={
          <Button variant="ghost" size="icon-xs">
            <MoreHorizontal />
          </Button>
        }
      >
        <InspectorSection title="Identity">
          <PropertyRow label="Name">
            <input
              type="text"
              defaultValue="Crankshaft"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Visible">
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)]">
              Yes
            </span>
          </PropertyRow>
        </InspectorSection>

        <InspectorSection title="Transform">
          <PropertyRow label="Position X" unit="mm" numeric showReset onReset={() => {}}>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Position Y" unit="mm" numeric showReset onReset={() => {}}>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Position Z" unit="mm" numeric showReset onReset={() => {}}>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Rotation X" unit="deg" numeric>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Rotation Y" unit="deg" numeric>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Rotation Z" unit="deg" numeric>
            <input
              type="number"
              defaultValue="0.000"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
        </InspectorSection>

        <InspectorSection title="Mass Properties">
          <PropertyRow label="Mass" unit="kg" numeric>
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
              3.250
            </span>
          </PropertyRow>
          <PropertyRow label="Volume" unit="mm³" numeric>
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
              412,750.00
            </span>
          </PropertyRow>
          <PropertyRow label="Density" unit="g/cm³" numeric>
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
              7.870
            </span>
          </PropertyRow>
          <PropertyRow label="Material">
            <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
              <option>Steel (AISI 1045)</option>
              <option>Aluminum (6061-T6)</option>
            </select>
          </PropertyRow>
        </InspectorSection>

        <InspectorSection title="Diagnostics" defaultOpen={false}>
          <PropertyRow label="Status">
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--success)]">
              Compiled
            </span>
          </PropertyRow>
          <PropertyRow label="Warnings" numeric>
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
              0
            </span>
          </PropertyRow>
          <PropertyRow label="Errors" numeric>
            <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums">
              0
            </span>
          </PropertyRow>
        </InspectorSection>
      </InspectorPanel>
    </div>
  ),
};
