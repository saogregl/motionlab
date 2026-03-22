import { SimulationAction } from '@motionlab/protocol';
import { Cpu, Play, RotateCcw } from 'lucide-react';

import { sendCompileMechanism, sendSimulationControl } from '../engine/connection.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';
import { useSimulationStore } from '../stores/simulation.js';
import type { CommandGroup } from './types.js';

export function useSimulationCommands(): CommandGroup {
  const engineStatus = useEngineConnection((s) => s.status);
  const simState = useSimulationStore((s) => s.state);

  const isReady = engineStatus === 'ready';
  const canCompile = isReady && (simState === 'idle' || simState === 'error');
  const canPlay = isReady && simState === 'paused';
  const canReset =
    isReady && (simState === 'running' || simState === 'paused' || simState === 'error');

  return {
    id: 'simulation',
    heading: 'Simulation',
    commands: [
      {
        id: 'sim.compile',
        label: 'Compile Mechanism',
        icon: Cpu,
        disabled: !canCompile,
        action: () => {
          const { timestep, gravity } = useSimulationSettingsStore.getState();
          sendCompileMechanism({ timestep, gravity });
        },
      },
      {
        id: 'sim.play',
        label: 'Run Simulation',
        icon: Play,
        shortcut: 'Space',
        disabled: !canPlay,
        action: () => sendSimulationControl(SimulationAction.PLAY),
      },
      {
        id: 'sim.reset',
        label: 'Reset Simulation',
        icon: RotateCcw,
        shortcut: 'R',
        disabled: !canReset,
        action: () => sendSimulationControl(SimulationAction.RESET),
      },
    ],
  };
}
