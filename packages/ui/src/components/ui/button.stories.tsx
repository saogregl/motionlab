import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight, Play, Plus, Settings, Trash2 } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'outline',
        'secondary',
        'ghost',
        'destructive',
        'link',
        'toolbar',
        'toolbar-active',
        'subtle',
      ],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
    disabled: { control: 'boolean' },
  },
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
  args: { variant: 'outline' },
};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const Ghost: Story = {
  args: { variant: 'ghost' },
};

export const Destructive: Story = {
  args: { variant: 'destructive' },
};

export const Link: Story = {
  args: { variant: 'link' },
};

export const Toolbar: Story = {
  args: { variant: 'toolbar' },
};

export const ToolbarActive: Story = {
  args: { variant: 'toolbar-active' },
};

export const Subtle: Story = {
  args: { variant: 'subtle' },
};

export const Small: Story = {
  args: { size: 'sm' },
};

export const Large: Story = {
  args: { size: 'lg' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-end gap-3">
        <Button size="xs">XS (20px)</Button>
        <Button size="sm">SM (24px)</Button>
        <Button size="default">Default (28px)</Button>
        <Button size="lg">LG (32px)</Button>
      </div>
      <div className="flex items-end gap-3">
        <Button size="icon-xs">
          <Settings />
        </Button>
        <Button size="icon-sm">
          <Settings />
        </Button>
        <Button size="icon">
          <Settings />
        </Button>
        <Button size="icon-lg">
          <Settings />
        </Button>
      </div>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-4">
      {(
        [
          'default',
          'outline',
          'secondary',
          'ghost',
          'destructive',
          'link',
          'toolbar',
          'toolbar-active',
          'subtle',
        ] as const
      ).map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-32 text-[length:var(--text-xs)] text-text-tertiary font-mono">
            {variant}
          </span>
          <Button variant={variant}>Button</Button>
          <Button variant={variant} size="sm">
            Small
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </div>
      ))}
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-4">
      <Button>
        <Plus /> Create
      </Button>
      <Button variant="secondary">
        <Settings /> Settings
      </Button>
      <Button variant="ghost">
        <ChevronRight /> Next
      </Button>
      <Button variant="destructive">
        <Trash2 /> Delete
      </Button>
      <Button variant="toolbar" size="icon">
        <Play />
      </Button>
      <Button variant="toolbar-active" size="icon">
        <Play />
      </Button>
    </div>
  ),
};
