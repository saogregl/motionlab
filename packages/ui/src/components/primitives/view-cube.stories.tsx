import type { Meta, StoryObj } from '@storybook/react-vite';

import { TooltipProvider } from '../ui/tooltip';

import { ViewCube } from './view-cube';

const meta: Meta = {
  title: 'Primitives/ViewCube',
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex items-center justify-center p-8 bg-bg-viewport">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ViewCube />,
};

export const Dark: Story = {
  render: () => <ViewCube />,
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};
