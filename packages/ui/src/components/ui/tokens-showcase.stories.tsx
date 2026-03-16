import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

function ColorSwatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="size-8 rounded-[var(--radius-sm)] border border-border-default shrink-0"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div className="min-w-0">
        <div className="text-[length:var(--text-xs)] text-text-primary truncate">{name}</div>
        <div className="text-[length:var(--text-2xs)] text-text-tertiary font-mono">{cssVar}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-[length:var(--text-lg)] font-semibold text-text-primary">{title}</h2>
      {children}
    </div>
  );
}

function TokensShowcase() {
  return (
    <div className="space-y-8 p-4 bg-bg-app min-h-0">
      {/* Surface Colors */}
      <Section title="Surface Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="App" cssVar="--bg-app" />
          <ColorSwatch name="Panel" cssVar="--bg-panel" />
          <ColorSwatch name="Subtle" cssVar="--bg-subtle" />
          <ColorSwatch name="Elevated" cssVar="--bg-elevated" />
          <ColorSwatch name="Inset" cssVar="--bg-inset" />
          <ColorSwatch name="Viewport" cssVar="--bg-viewport" />
        </div>
      </Section>

      {/* Border Colors */}
      <Section title="Border Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="Default" cssVar="--border-default" />
          <ColorSwatch name="Strong" cssVar="--border-strong" />
          <ColorSwatch name="Subtle" cssVar="--border-subtle" />
        </div>
      </Section>

      {/* Text Colors */}
      <Section title="Text Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="Primary" cssVar="--text-primary" />
          <ColorSwatch name="Secondary" cssVar="--text-secondary" />
          <ColorSwatch name="Tertiary" cssVar="--text-tertiary" />
          <ColorSwatch name="Disabled" cssVar="--text-disabled" />
          <ColorSwatch name="Inverse" cssVar="--text-inverse" />
        </div>
      </Section>

      {/* Accent Colors */}
      <Section title="Accent Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="Primary" cssVar="--accent-primary" />
          <ColorSwatch name="Hover" cssVar="--accent-hover" />
          <ColorSwatch name="Pressed" cssVar="--accent-pressed" />
          <ColorSwatch name="Soft" cssVar="--accent-soft" />
          <ColorSwatch name="Soft Hover" cssVar="--accent-soft-hover" />
          <ColorSwatch name="Text" cssVar="--accent-text" />
        </div>
      </Section>

      {/* Semantic States */}
      <Section title="Semantic States">
        <div className="grid grid-cols-4 gap-4">
          <ColorSwatch name="Success" cssVar="--success" />
          <ColorSwatch name="Success Soft" cssVar="--success-soft" />
          <ColorSwatch name="Warning" cssVar="--warning" />
          <ColorSwatch name="Warning Soft" cssVar="--warning-soft" />
          <ColorSwatch name="Danger" cssVar="--danger" />
          <ColorSwatch name="Danger Soft" cssVar="--danger-soft" />
          <ColorSwatch name="Info" cssVar="--info" />
          <ColorSwatch name="Info Soft" cssVar="--info-soft" />
        </div>
      </Section>

      {/* Axis Colors */}
      <Section title="Axis Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="X Axis" cssVar="--axis-x" />
          <ColorSwatch name="Y Axis" cssVar="--axis-y" />
          <ColorSwatch name="Z Axis" cssVar="--axis-z" />
        </div>
      </Section>

      {/* Joint Type Colors */}
      <Section title="Joint Type Colors">
        <div className="grid grid-cols-4 gap-4">
          <ColorSwatch name="Revolute" cssVar="--joint-revolute" />
          <ColorSwatch name="Slider" cssVar="--joint-slider" />
          <ColorSwatch name="Cylindrical" cssVar="--joint-cylindrical" />
          <ColorSwatch name="Ball" cssVar="--joint-ball" />
          <ColorSwatch name="Fixed" cssVar="--joint-fixed" />
          <ColorSwatch name="Contact" cssVar="--joint-contact" />
          <ColorSwatch name="Fastened" cssVar="--joint-fastened" />
          <ColorSwatch name="Planar" cssVar="--joint-planar" />
        </div>
      </Section>

      {/* Status Colors */}
      <Section title="Status Colors">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="Compiled" cssVar="--status-compiled" />
          <ColorSwatch name="Stale" cssVar="--status-stale" />
          <ColorSwatch name="Running" cssVar="--status-running" />
          <ColorSwatch name="Failed" cssVar="--status-failed" />
          <ColorSwatch name="Warning" cssVar="--status-warning" />
        </div>
      </Section>

      {/* Typography Scale */}
      <Section title="Typography Scale">
        <div className="space-y-3 bg-bg-panel p-4 rounded-[var(--radius-lg)]">
          {[
            ['text-2xs', '--text-2xs', '11px'],
            ['text-xs', '--text-xs', '12px'],
            ['text-sm', '--text-sm', '13px'],
            ['text-base', '--text-base', '14px'],
            ['text-lg', '--text-lg', '16px'],
            ['text-xl', '--text-xl', '18px'],
            ['text-2xl', '--text-2xl', '24px'],
          ].map(([name, cssVar, px]) => (
            <div key={name} className="flex items-baseline gap-4">
              <span className="text-text-primary" style={{ fontSize: `var(${cssVar})` }}>
                The quick brown fox jumps over the lazy dog
              </span>
              <span className="text-[length:var(--text-2xs)] text-text-tertiary font-mono shrink-0">
                {name} ({px})
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Spacing Scale */}
      <Section title="Spacing Scale">
        <div className="space-y-2 bg-bg-panel p-4 rounded-[var(--radius-lg)]">
          {[
            ['space-1', '--space-1', '4px'],
            ['space-2', '--space-2', '8px'],
            ['space-3', '--space-3', '12px'],
            ['space-4', '--space-4', '16px'],
            ['space-5', '--space-5', '20px'],
            ['space-6', '--space-6', '24px'],
            ['space-8', '--space-8', '32px'],
            ['space-10', '--space-10', '40px'],
            ['space-12', '--space-12', '48px'],
          ].map(([name, cssVar, px]) => (
            <div key={name} className="flex items-center gap-3">
              <div
                className="h-4 bg-accent-primary rounded-sm shrink-0"
                style={{ width: `var(${cssVar})` }}
              />
              <span className="text-[length:var(--text-xs)] text-text-tertiary font-mono">
                {name} ({px})
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Radius Samples */}
      <Section title="Radius">
        <div className="flex gap-4 bg-bg-panel p-4 rounded-[var(--radius-lg)]">
          {[
            ['sm', '--radius-sm', '3px'],
            ['md', '--radius-md', '5px'],
            ['lg', '--radius-lg', '8px'],
            ['xl', '--radius-xl', '12px'],
          ].map(([name, cssVar, px]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div
                className="size-16 bg-accent-soft border border-accent-primary"
                style={{ borderRadius: `var(${cssVar})` }}
              />
              <span className="text-[length:var(--text-2xs)] text-text-tertiary font-mono">
                {name} ({px})
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Shadow Samples */}
      <Section title="Shadows">
        <div className="flex gap-6 bg-bg-app p-6 rounded-[var(--radius-lg)]">
          {[
            ['low', '--shadow-low'],
            ['medium', '--shadow-medium'],
            ['overlay', '--shadow-overlay'],
          ].map(([name, cssVar]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div
                className="size-20 bg-bg-panel rounded-[var(--radius-md)]"
                style={{ boxShadow: `var(${cssVar})` }}
              />
              <span className="text-[length:var(--text-2xs)] text-text-tertiary font-mono">
                {name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Selection Colors */}
      <Section title="Selection & Interactive">
        <div className="grid grid-cols-3 gap-4">
          <ColorSwatch name="Selection Fill" cssVar="--selection-fill" />
          <ColorSwatch name="Selection Fill Strong" cssVar="--selection-fill-strong" />
          <ColorSwatch name="Selection Row" cssVar="--selection-row" />
          <ColorSwatch name="Selection Row Inactive" cssVar="--selection-row-inactive" />
          <ColorSwatch name="Hover Overlay" cssVar="--hover-overlay" />
          <ColorSwatch name="Pressed Overlay" cssVar="--pressed-overlay" />
        </div>
      </Section>
    </div>
  );
}

const meta = {
  title: 'Design System/Tokens',
  component: TokensShowcase,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof TokensShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {};

export const DarkTheme: Story = {
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};

export const CompactDensity: Story = {
  decorators: [
    (Story) => (
      <div className="compact">
        <Story />
      </div>
    ),
  ],
};
