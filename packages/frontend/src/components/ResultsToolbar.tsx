import { ToolbarButton, ToolbarGroup } from '@motionlab/ui';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';

import { executeCommand } from '../commands/registry.js';
import { useCmdDisabled } from '../hooks/use-cmd-disabled.js';
import { useSimulationStore } from '../stores/simulation.js';
import { ViewDropdown } from './MainToolbar.js';

export function ResultsToolbar() {
  const simState = useSimulationStore((s) => s.state);

  const errorMessage = useSimulationStore((s) => s.errorMessage);

  const playDisabled = useCmdDisabled('sim.play');
  const pauseDisabled = useCmdDisabled('sim.pause');
  const stepDisabled = useCmdDisabled('sim.step');
  const resetDisabled = useCmdDisabled('sim.reset');

  return (
    <div
      data-slot="results-toolbar"
      className="pointer-events-auto absolute top-[var(--panel-float-inset)] left-1/2 -translate-x-1/2 z-[var(--z-toolbar)] flex h-[var(--toolbar-h)] w-fit items-center gap-0.5 rounded-[var(--panel-radius)] border border-[var(--border-default)] bg-layer-base ps-1.5 pe-1.5"
    >
      {/* Simulation controls */}
      <ToolbarGroup separator>
        {simState === 'running' ? (
          <ToolbarButton
            tooltip="Pause"
            shortcut="Space"
            disabled={pauseDisabled}
            onClick={() => executeCommand('sim.pause')}
          >
            <Pause className="size-4" />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            tooltip="Play"
            shortcut="Space"
            disabled={playDisabled}
            onClick={() => executeCommand('sim.play')}
          >
            <Play className="size-4" />
          </ToolbarButton>
        )}

        <ToolbarButton
          tooltip="Step"
          shortcut="."
          disabled={stepDisabled}
          onClick={() => executeCommand('sim.step')}
        >
          <StepForward className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Reset"
          shortcut="R"
          disabled={resetDisabled}
          onClick={() => executeCommand('sim.reset')}
        >
          <RotateCcw className="size-4" />
        </ToolbarButton>

        {simState === 'compiling' && (
          <span className="ms-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            Compiling…
          </span>
        )}
        {simState === 'error' && errorMessage && (
          <span
            className="ms-2 max-w-[300px] truncate text-[length:var(--text-2xs)] text-destructive"
            title={errorMessage}
          >
            {errorMessage}
          </span>
        )}
      </ToolbarGroup>

      {/* View dropdown */}
      <ToolbarGroup>
        <ViewDropdown />
      </ToolbarGroup>
    </div>
  );
}
