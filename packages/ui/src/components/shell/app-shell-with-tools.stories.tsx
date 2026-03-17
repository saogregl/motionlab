import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Crosshair, Link2, MoreHorizontal } from 'lucide-react';
import { useState, useCallback } from 'react';

import { Button } from '../ui/button';
import { FloatingToolCard } from '../primitives/floating-tool-card';
import { PropertyRow } from '../primitives/property-row';
import { TreeRow, GroupHeaderRow } from '../primitives/tree-row';
import { InspectorPanel } from '../primitives/inspector-panel';
import { InspectorSection } from '../primitives/inspector-section';
import { TimelineTransport } from '../primitives/timeline-transport';
import { TimelineScrubber } from '../primitives/timeline-scrubber';
import { BodyContextMenu } from '../primitives/context-menus';
import { SelectionChip } from '../engineering/selection-chip';
import { ViewportHUD } from './viewport-hud';

const meta = {
  title: 'Shell/AppShellWithTools',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Axis indicator placeholder ── */

function AxisIndicatorPlaceholder() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* X axis */}
      <line x1="8" y1="36" x2="40" y2="36" stroke="var(--axis-x)" strokeWidth="2" />
      <text x="42" y="38" fill="var(--axis-x)" fontSize="10" fontWeight="600">X</text>
      {/* Y axis */}
      <line x1="8" y1="36" x2="8" y2="4" stroke="var(--axis-y)" strokeWidth="2" />
      <text x="4" y="2" fill="var(--axis-y)" fontSize="10" fontWeight="600">Y</text>
      {/* Z axis */}
      <line x1="8" y1="36" x2="24" y2="20" stroke="var(--axis-z)" strokeWidth="2" />
      <text x="26" y="18" fill="var(--axis-z)" fontSize="10" fontWeight="600">Z</text>
    </svg>
  );
}

/* ── ViewCube placeholder ── */

function ViewCubePlaceholder() {
  return (
    <div className="flex size-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--layer-base)] text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
      View Cube
    </div>
  );
}

/* ── Main story ── */

function FullIntegrationDemo() {
  const [toolCardOpen, setToolCardOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(0.342);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedBody, setSelectedBody] = useState('Caliper Arm');
  const [bodiesExpanded, setBodiesExpanded] = useState(true);
  const [jointsExpanded, setJointsExpanded] = useState(true);
  const duration = 2.0;
  const stepSize = 1 / 60;

  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);

  return (
    <div
      className="grid h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] font-[family-name:var(--font-ui)] text-[length:var(--text-base)]"
      style={{
        gridTemplateRows: 'var(--topbar-h) 1fr var(--bottom-tabs-h)',
        gridTemplateColumns: '1fr',
      }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--layer-base)] px-3">
        <span className="text-[length:var(--text-base)] font-semibold">MotionLab</span>
        <span className="h-5 w-px bg-[var(--border-default)]" />
        <span className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">Water Pump Assembly</span>
        <span className="ml-auto text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          Compiled
        </span>
      </div>

      {/* ── Main body ── */}
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateColumns: 'var(--panel-left-w) 1fr var(--panel-right-w)',
          gridTemplateRows: '1fr var(--bottom-dock-h)',
        }}
      >
        {/* Left panel */}
        <div className="row-span-2 overflow-y-auto border-r border-[var(--border-default)] bg-[var(--layer-base)]">
          {/* Panel header tabs */}
          <div className="flex h-8 items-center gap-4 border-b border-[var(--border-default)] px-3">
            <span className="border-b-2 border-[var(--accent-primary)] pb-1 text-[length:var(--text-xs)] font-medium uppercase text-[var(--text-primary)]">
              Structure
            </span>
            <span className="text-[length:var(--text-xs)] font-medium uppercase text-[var(--text-tertiary)]">
              Studies
            </span>
          </div>

          {/* Tree */}
          <div className="py-1">
            <GroupHeaderRow
              label="Bodies"
              count={4}
              expanded={bodiesExpanded}
              onToggleExpand={() => setBodiesExpanded((e) => !e)}
            />
            {bodiesExpanded && (
              <>
                <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                  <TreeRow
                    level={1}
                    name="Caliper Arm"
                    icon={<Box className="size-4 text-[var(--accent-text)]" />}
                    selected={selectedBody === 'Caliper Arm'}
                    focused={selectedBody === 'Caliper Arm'}
                    onSelect={() => setSelectedBody('Caliper Arm')}
                    onToggleVisibility={() => {}}
                    onContextMenu={() => {}}
                  />
                </BodyContextMenu>
                <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                  <TreeRow
                    level={1}
                    name="Piston"
                    icon={<Box className="size-4 text-[var(--accent-text)]" />}
                    selected={selectedBody === 'Piston'}
                    onSelect={() => setSelectedBody('Piston')}
                    onToggleVisibility={() => {}}
                    onContextMenu={() => {}}
                  />
                </BodyContextMenu>
                <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                  <TreeRow
                    level={1}
                    name="Housing"
                    icon={<Box className="size-4 text-[var(--accent-text)]" />}
                    selected={selectedBody === 'Housing'}
                    onSelect={() => setSelectedBody('Housing')}
                    onToggleVisibility={() => {}}
                    onContextMenu={() => {}}
                  />
                </BodyContextMenu>
                <BodyContextMenu onRename={() => {}} onDelete={() => {}}>
                  <TreeRow
                    level={1}
                    name="Impeller"
                    icon={<Box className="size-4 text-[var(--accent-text)]" />}
                    selected={selectedBody === 'Impeller'}
                    onSelect={() => setSelectedBody('Impeller')}
                    onToggleVisibility={() => {}}
                    onContextMenu={() => {}}
                  />
                </BodyContextMenu>
              </>
            )}

            <GroupHeaderRow
              label="Joints"
              count={3}
              expanded={jointsExpanded}
              onToggleExpand={() => setJointsExpanded((e) => !e)}
            />
            {jointsExpanded && (
              <>
                <TreeRow
                  level={1}
                  name="Rev_1"
                  icon={<Link2 className="size-4 text-[var(--joint-revolute)]" />}
                  secondary="Revolute"
                  onSelect={() => {}}
                />
                <TreeRow
                  level={1}
                  name="Rev_2"
                  icon={<Link2 className="size-4 text-[var(--joint-revolute)]" />}
                  secondary="Revolute"
                  onSelect={() => {}}
                />
                <TreeRow
                  level={1}
                  name="Fixed_1"
                  icon={<Link2 className="size-4 text-[var(--joint-fixed)]" />}
                  secondary="Fixed"
                  onSelect={() => {}}
                />
              </>
            )}
          </div>
        </div>

        {/* Center viewport */}
        <div className="relative bg-[var(--bg-viewport)] overflow-hidden">
          <ViewportHUD
            topLeft={
              toolCardOpen ? (
                <FloatingToolCard
                  icon={<Crosshair className="size-4" />}
                  title="Create Datum"
                  onClose={() => setToolCardOpen(false)}
                  footer={
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setToolCardOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="sm">Confirm</Button>
                    </>
                  }
                >
                  <PropertyRow label="Mode">
                    <select className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none">
                      <option>On Face</option>
                      <option>At Point</option>
                    </select>
                  </PropertyRow>
                  <PropertyRow label="Name">
                    <input
                      type="text"
                      defaultValue="Datum_4"
                      className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--field-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </PropertyRow>
                </FloatingToolCard>
              ) : undefined
            }
            topRight={<ViewCubePlaceholder />}
            bottomLeft={<AxisIndicatorPlaceholder />}
            bottomCenter={
              <SelectionChip
                icon={<Box className="size-3.5 text-[var(--accent-text)]" />}
                name={selectedBody}
                onClick={() => {}}
              />
            }
          />
        </div>

        {/* Right panel */}
        <div className="row-span-2 border-l border-[var(--border-default)] bg-[var(--layer-base)]">
          <InspectorPanel
            entityName={selectedBody}
            entityType="Body"
            entityIcon={<Box className="size-5" />}
            statusLine="Compiled"
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
                  defaultValue={selectedBody}
                  className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-[length:var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
              </PropertyRow>
              <PropertyRow label="Source">
                <span className="flex h-6 items-center text-[length:var(--text-sm)] text-[var(--text-primary)]">
                  imported_asm.step
                </span>
              </PropertyRow>
            </InspectorSection>
            <InspectorSection title="Transform">
              <PropertyRow label="Position X" unit="mm" numeric>
                <input
                  type="number"
                  defaultValue="12.500"
                  className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                />
              </PropertyRow>
              <PropertyRow label="Position Y" unit="mm" numeric>
                <input
                  type="number"
                  defaultValue="0.000"
                  className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                />
              </PropertyRow>
              <PropertyRow label="Position Z" unit="mm" numeric>
                <input
                  type="number"
                  defaultValue="-3.200"
                  className="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] px-1.5 text-right text-[length:var(--text-sm)] text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--accent-primary)]"
                />
              </PropertyRow>
            </InspectorSection>
          </InspectorPanel>
        </div>

        {/* Bottom dock */}
        <div className="border-t border-[var(--border-default)] bg-[var(--layer-base)] flex flex-col">
          {/* Dock tab bar */}
          <div className="flex h-7 shrink-0 items-center gap-0 border-b border-[var(--border-subtle)] bg-[var(--layer-recessed)]">
            <span className="flex h-7 items-center border-t-2 border-[var(--accent-primary)] bg-[var(--layer-base)] px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
              Timeline
            </span>
            <span className="flex h-7 items-center px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-tertiary)]">
              Charts
            </span>
            <span className="flex h-7 items-center px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-tertiary)]">
              Diagnostics
            </span>
          </div>
          {/* Timeline content */}
          <div className="flex-1 min-h-0">
            <TimelineTransport
              isPlaying={isPlaying}
              isLooping={isLooping}
              speed={speed}
              currentTime={currentTime}
              duration={duration}
              onPlayPause={() => setIsPlaying((p) => !p)}
              onStepForward={() => setCurrentTime((t) => Math.min(duration, t + stepSize))}
              onStepBack={() => setCurrentTime((t) => Math.max(0, t - stepSize))}
              onSkipForward={() => setCurrentTime(duration)}
              onSkipBack={() => setCurrentTime(0)}
              onLoopToggle={() => setIsLooping((l) => !l)}
              onSpeedChange={setSpeed}
            />
            <div className="px-2 pb-2">
              <TimelineScrubber
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                tickInterval={0.2}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom workspace tab bar ── */}
      <div className="flex items-center gap-0 border-t border-[var(--border-default)] bg-[var(--layer-recessed)]">
        <span className="flex h-8 items-center border-t-2 border-[var(--accent-primary)] bg-[var(--layer-base)] px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
          Assembly_1
        </span>
        <span className="flex h-8 items-center px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-secondary)]">
          Simulation_1
        </span>
      </div>
    </div>
  );
}

export const FullIntegration: Story = {
  render: () => <FullIntegrationDemo />,
};
