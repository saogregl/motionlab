import { SimulationAction } from '@motionlab/protocol';
import { Cpu, Pause, Play, RotateCcw, Settings2, StepForward } from 'lucide-react';

import { sendCompileMechanism, sendSimulationControl } from '../../engine/connection.js';
import { useDialogStore } from '../../stores/dialogs.js';
import { useEngineConnection } from '../../stores/engine-connection.js';
import { useSimulationSettingsStore } from '../../stores/simulation-settings.js';
import { useSimulationStore } from '../../stores/simulation.js';
import type { CommandDef } from '../types.js';

export function createSimulateCommands(): CommandDef[] {
  const isEngineReady = () => useEngineConnection.getState().status === 'ready';

  return [
    {
      id: 'sim.compile',
      label: 'Compile Mechanism',
      icon: Cpu,
      category: 'simulate',
      enabled: () => {
        const s = useSimulationStore.getState().state;
        return isEngineReady() && (s === 'idle' || s === 'error');
      },
      execute: () => {
        const { timestep, gravity } = useSimulationSettingsStore.getState();
        sendCompileMechanism({ timestep, gravity });
      },
    },
    {
      id: 'sim.play',
      label: 'Play Simulation',
      icon: Play,
      category: 'simulate',
      shortcut: 'Space',
      enabled: () => isEngineReady() && useSimulationStore.getState().state === 'paused',
      execute: () => sendSimulationControl(SimulationAction.PLAY),
    },
    {
      id: 'sim.pause',
      label: 'Pause Simulation',
      icon: Pause,
      category: 'simulate',
      shortcut: 'Space',
      enabled: () => isEngineReady() && useSimulationStore.getState().state === 'running',
      execute: () => sendSimulationControl(SimulationAction.PAUSE),
    },
    {
      id: 'sim.step',
      label: 'Step Simulation',
      icon: StepForward,
      category: 'simulate',
      shortcut: '.',
      enabled: () => isEngineReady() && useSimulationStore.getState().state === 'paused',
      execute: () => sendSimulationControl(SimulationAction.STEP),
    },
    {
      id: 'sim.reset',
      label: 'Reset Simulation',
      icon: RotateCcw,
      category: 'simulate',
      shortcut: 'R',
      enabled: () => {
        const s = useSimulationStore.getState().state;
        return isEngineReady() && (s === 'running' || s === 'paused' || s === 'error');
      },
      execute: () => sendSimulationControl(SimulationAction.RESET),
    },
    {
      id: 'sim.settings',
      label: 'Simulation Settings',
      icon: Settings2,
      category: 'simulate',
      enabled: isEngineReady,
      execute: () => useDialogStore.getState().open('sim-settings'),
    },
  ];
}
