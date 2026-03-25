import { SimulationAction } from '@motionlab/protocol';
import { Pause, Play, RotateCcw, Settings2, StepForward } from 'lucide-react';

import {
  sendCompileAndPlay,
  sendCompileAndStep,
  sendSimulationControl,
} from '../../engine/connection.js';
import { useDialogStore } from '../../stores/dialogs.js';
import { useEngineConnection } from '../../stores/engine-connection.js';
import { useSimulationStore } from '../../stores/simulation.js';
import { useUILayoutStore } from '../../stores/ui-layout.js';
import type { CommandDef } from '../types.js';

export function createSimulateCommands(): CommandDef[] {
  const isEngineReady = () => useEngineConnection.getState().status === 'ready';

  return [
    {
      id: 'sim.play',
      label: 'Play Simulation',
      icon: Play,
      category: 'simulate',
      shortcut: 'Space',
      enabled: () => {
        const s = useSimulationStore.getState().state;
        return isEngineReady() && (s === 'idle' || s === 'paused' || s === 'error');
      },
      execute: () => {
        sendCompileAndPlay();
      },
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
      enabled: () => {
        const s = useSimulationStore.getState().state;
        return isEngineReady() && (s === 'idle' || s === 'paused' || s === 'error');
      },
      execute: () => sendCompileAndStep(),
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
      execute: () => {
        sendSimulationControl(SimulationAction.RESET);
        useUILayoutStore.getState().setActiveWorkspace('build');
      },
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
