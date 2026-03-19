import type { Meta, StoryObj } from '@storybook/react-vite';
import { Crosshair, Play, Square } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/button';
import { FloatingToolCard } from './floating-tool-card';
import { PropertyRow } from './property-row';

const meta = {
  title: 'Primitives/FloatingToolCard',
  component: FloatingToolCard,
  parameters: { layout: 'padded' },
  args: {
    title: 'Tool Card',
  },
} satisfies Meta<typeof FloatingToolCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateDatum: Story = {
  render: () => (
    <div className="relative h-[400px] w-[600px] bg-[var(--bg-viewport)] rounded-[var(--radius-md)] overflow-hidden">
      <FloatingToolCard
        icon={<Crosshair className="size-4" />}
        title="Create Datum"
        onClose={() => {}}
        footer={
          <>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button size="sm">Confirm</Button>
          </>
        }
      >
        <PropertyRow label="Mode">
          <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
            <option>On Face</option>
            <option>At Point</option>
            <option>Between Bodies</option>
          </select>
        </PropertyRow>
        <PropertyRow label="Name">
          <input
            type="text"
            defaultValue="Datum_4"
            className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </PropertyRow>
        <PropertyRow label="Parent">
          <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-tertiary)] italic">
            select body...
          </span>
        </PropertyRow>
      </FloatingToolCard>
    </div>
  ),
};

export const AnimateMate: Story = {
  render: () => {
    const [isPlaying, setIsPlaying] = useState(false);

    return (
      <div className="relative h-[400px] w-[600px] bg-[var(--bg-viewport)] rounded-[var(--radius-md)] overflow-hidden">
        <FloatingToolCard
          icon={<Play className="size-4" />}
          title="Animate Mate"
          onClose={() => {}}
          footer={
            <Button
              variant={isPlaying ? 'toolbar-active' : 'toolbar'}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <>
                  <Square className="size-3" /> Stop
                </>
              ) : (
                <>
                  <Play className="size-3" /> Play
                </>
              )}
            </Button>
          }
        >
          <PropertyRow label="DOF">
            <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
              <option>Rotation Z</option>
              <option>Translation X</option>
            </select>
          </PropertyRow>
          <PropertyRow label="Start" unit="deg" numeric>
            <input
              type="number"
              defaultValue="0"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="End" unit="deg" numeric>
            <input
              type="number"
              defaultValue="360"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Steps" numeric>
            <input
              type="number"
              defaultValue="36"
              className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
            />
          </PropertyRow>
          <PropertyRow label="Playback">
            <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
              <option>Once</option>
              <option>Loop</option>
              <option>Ping-pong</option>
            </select>
          </PropertyRow>
        </FloatingToolCard>
      </div>
    );
  },
};

export const Dragged: Story = {
  render: () => (
    <div className="relative h-[500px] w-[800px] bg-[var(--bg-viewport)] rounded-[var(--radius-md)] overflow-hidden">
      <FloatingToolCard
        icon={<Crosshair className="size-4" />}
        title="Create Datum"
        onClose={() => {}}
        defaultPosition={{ x: 200, y: 100 }}
        footer={
          <>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button size="sm">Confirm</Button>
          </>
        }
      >
        <PropertyRow label="Mode">
          <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
            <option>On Face</option>
          </select>
        </PropertyRow>
        <PropertyRow label="Name">
          <input
            type="text"
            defaultValue="Datum_4"
            className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-recessed)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </PropertyRow>
      </FloatingToolCard>
    </div>
  ),
};
