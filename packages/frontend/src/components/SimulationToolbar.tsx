import { SimulationAction } from '@motionlab/protocol';
import { SecondaryToolbar, ToolbarButton } from '@motionlab/ui';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';

import {
  sendCompileAndPlay,
  sendCompileAndStep,
  sendSimulationControl,
} from '../engine/connection.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useSimulationStore } from '../stores/simulation.js';

export function SimulationToolbar() {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const errorMessage = useSimulationStore((s) => s.errorMessage);
  const needsCompile = useSimulationStore((s) => s.needsCompile);
  const isEngineReady = useEngineConnection((s) => s.status === 'ready');

  const canPlay =
    isEngineReady && (simState === 'idle' || simState === 'paused' || simState === 'error');
  const canPause = simState === 'running';
  const canStep =
    isEngineReady && (simState === 'idle' || simState === 'paused' || simState === 'error');
  const canReset = simState === 'running' || simState === 'paused' || simState === 'error';

  // Show a stale indicator when already compiled but model/settings changed since.
  const isStale = simState === 'paused' && needsCompile;

  return (
    <SecondaryToolbar
      rightActions={
        <span className="px-2 font-mono text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          t = {simTime.toFixed(3)}s
        </span>
      }
    >
      <ToolbarButton
        tooltip={isStale ? 'Play (will recompile — settings changed)' : 'Play (Space)'}
        disabled={!canPlay}
        onClick={() => sendCompileAndPlay()}
        data-stale={isStale || undefined}
      >
        <Play className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Pause (Space)"
        disabled={!canPause}
        onClick={() => sendSimulationControl(SimulationAction.PAUSE)}
      >
        <Pause className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        tooltip={isStale ? 'Step (will recompile — settings changed)' : 'Step (.)'}
        disabled={!canStep}
        onClick={() => sendCompileAndStep()}
      >
        <StepForward className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Reset (R)"
        disabled={!canReset}
        onClick={() => sendSimulationControl(SimulationAction.RESET)}
      >
        <RotateCcw className="size-4" />
      </ToolbarButton>

      {simState === 'compiling' && (
        <span className="ml-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          Compiling…
        </span>
      )}
      {simState === 'error' && errorMessage && (
        <span
          className="ml-2 text-[length:var(--text-2xs)] text-destructive truncate max-w-[300px]"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      )}
    </SecondaryToolbar>
  );
}
