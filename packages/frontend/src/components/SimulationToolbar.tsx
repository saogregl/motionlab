import { SimulationAction } from '@motionlab/protocol';
import { SecondaryToolbar, ToolbarButton } from '@motionlab/ui';
import { Cpu, Pause, Play, RotateCcw, StepForward } from 'lucide-react';

import { sendCompileMechanism, sendSimulationControl } from '../engine/connection.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';
import { useSimulationStore } from '../stores/simulation.js';

export function SimulationToolbar() {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const errorMessage = useSimulationStore((s) => s.errorMessage);

  const canCompile = simState === 'idle' || simState === 'error';
  const canPlay = simState === 'paused';
  const canPause = simState === 'running';
  const canStep = simState === 'paused';
  const canReset = simState === 'running' || simState === 'paused' || simState === 'error';

  return (
    <SecondaryToolbar
      rightActions={
        <span className="px-2 font-mono text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          t = {simTime.toFixed(3)}s
        </span>
      }
    >
      <ToolbarButton
        tooltip="Compile mechanism"
        disabled={!canCompile}
        onClick={() => {
          const s = useSimulationSettingsStore.getState();
          sendCompileMechanism({
            timestep: s.timestep,
            gravity: s.gravity,
            duration: s.duration,
            solver: {
              type: s.solverType,
              maxIterations: s.maxIterations,
              tolerance: s.tolerance,
              integrator: s.integratorType,
            },
            contact: {
              friction: s.friction,
              restitution: s.restitution,
              compliance: s.compliance,
              damping: s.contactDamping,
              enableContact: s.enableContact,
            },
          });
        }}
      >
        <Cpu className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Play (Space)"
        disabled={!canPlay}
        onClick={() => sendSimulationControl(SimulationAction.PLAY)}
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
        tooltip="Step (.)"
        disabled={!canStep}
        onClick={() => sendSimulationControl(SimulationAction.STEP)}
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
        <span className="ml-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Compiling…</span>
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
