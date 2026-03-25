import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { InspectorSection } from '../primitives/inspector-section';
import { PropertyRow } from '../primitives/property-row';

import { FloatingPanel, FloatingPanelHeader } from './floating-panel';

const meta: Meta<typeof FloatingPanel> = {
  title: 'Shell/FloatingPanel',
  component: FloatingPanel,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="relative h-screen w-screen bg-bg-viewport">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FloatingPanel>;

function PanelContent({ title }: { title: string }) {
  return (
    <>
      <FloatingPanelHeader>
        <span className="text-[length:var(--text-sm)] font-bold text-text-primary">{title}</span>
      </FloatingPanelHeader>
      <div className="flex-1 overflow-auto p-2">
        <InspectorSection title="Properties">
          <PropertyRow label="Name">
            <span className="text-[length:var(--text-sm)] text-text-primary">Example Entity</span>
          </PropertyRow>
          <PropertyRow label="Type">
            <span className="text-[length:var(--text-sm)] text-text-primary">Body</span>
          </PropertyRow>
        </InspectorSection>
        <div className="mt-1">
          <InspectorSection title="Transform">
            <PropertyRow label="Position">
              <span className="text-[length:var(--text-sm)] text-text-primary">0, 0, 0</span>
            </PropertyRow>
          </InspectorSection>
        </div>
      </div>
    </>
  );
}

export const LeftOpen: Story = {
  render: () => (
    <FloatingPanel side="left" open width={288}>
      <PanelContent title="Structure" />
    </FloatingPanel>
  ),
};

export const RightOpen: Story = {
  render: () => (
    <FloatingPanel side="right" open width={288}>
      <PanelContent title="Inspector" />
    </FloatingPanel>
  ),
};

export const LeftClosed: Story = {
  render: () => (
    <FloatingPanel side="left" open={false} width={288}>
      <PanelContent title="Structure" />
    </FloatingPanel>
  ),
};

function ResizableDemo() {
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <>
      <div className="absolute top-3 left-1/2 z-50 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          className="rounded bg-layer-elevated px-3 py-1 text-[length:var(--text-xs)] text-text-primary"
          onClick={() => setLeftOpen((o) => !o)}
        >
          Toggle Left [{leftOpen ? 'open' : 'closed'}]
        </button>
        <button
          type="button"
          className="rounded bg-layer-elevated px-3 py-1 text-[length:var(--text-xs)] text-text-primary"
          onClick={() => setRightOpen((o) => !o)}
        >
          Toggle Right [{rightOpen ? 'open' : 'closed'}]
        </button>
      </div>
      <FloatingPanel side="left" open={leftOpen} width={leftWidth} onWidthChange={setLeftWidth}>
        <PanelContent title="Structure" />
      </FloatingPanel>
      <FloatingPanel side="right" open={rightOpen} width={rightWidth} onWidthChange={setRightWidth}>
        <PanelContent title="Inspector" />
      </FloatingPanel>
    </>
  );
}

export const WithResize: Story = {
  render: () => <ResizableDemo />,
};
