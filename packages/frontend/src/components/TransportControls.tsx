import { ToolbarButton } from '@motionlab/ui';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';

import { executeCommand } from '../commands/registry.js';
import { useCommand } from '../commands/use-commands.js';
import { useSimulationStore } from '../stores/simulation.js';

function useCmdDisabled(id: string): boolean {
  const cmd = useCommand(id);
  return cmd?.disabled ?? true;
}

export function TransportControls() {
  const simState = useSimulationStore((s) => s.state);

  const errorMessage = useSimulationStore((s) => s.errorMessage);

  const playDisabled = useCmdDisabled('sim.play');
  const pauseDisabled = useCmdDisabled('sim.pause');
  const stepDisabled = useCmdDisabled('sim.step');
  const resetDisabled = useCmdDisabled('sim.reset');

  return (
    <div className="flex items-center gap-0.5">
      {simState === 'running' ? (
        <ToolbarButton
          tooltip="Pause"
          shortcut="Space"
          disabled={pauseDisabled}
          onClick={() => executeCommand('sim.pause')}
        >
          <Pause className="size-3.5" />
        </ToolbarButton>
      ) : (
        <ToolbarButton
          tooltip="Play"
          shortcut="Space"
          disabled={playDisabled}
          onClick={() => executeCommand('sim.play')}
        >
          <Play className="size-3.5" />
        </ToolbarButton>
      )}

      <ToolbarButton
        tooltip="Step"
        shortcut="."
        disabled={stepDisabled}
        onClick={() => executeCommand('sim.step')}
      >
        <StepForward className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Reset"
        shortcut="R"
        disabled={resetDisabled}
        onClick={() => executeCommand('sim.reset')}
      >
        <RotateCcw className="size-3.5" />
      </ToolbarButton>

      {simState === 'compiling' && (
        <span className="ms-1.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          Compiling…
        </span>
      )}
      {simState === 'error' && errorMessage && (
        <span
          className="ms-1.5 max-w-[200px] truncate text-[length:var(--text-2xs)] text-destructive"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
