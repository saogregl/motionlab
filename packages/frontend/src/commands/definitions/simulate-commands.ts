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
