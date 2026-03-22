import { Crosshair, Import, Link2 } from 'lucide-react';

import { sendImportAsset } from '../engine/connection.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import type { CommandGroup } from './types.js';

export function useAuthoringCommands(): CommandGroup {
  const engineStatus = useEngineConnection((s) => s.status);
  const simState = useSimulationStore((s) => s.state);

  const isReady = engineStatus === 'ready';
  const isSimulating = simState === 'running' || simState === 'paused';

  return {
    id: 'authoring',
    heading: 'Authoring',
    commands: [
      {
        id: 'authoring.create-datum',
        label: 'Create Datum',
        icon: Crosshair,
        shortcut: 'D',
        disabled: isSimulating,
        action: () => useToolModeStore.getState().setMode('create-datum'),
      },
      {
        id: 'authoring.create-joint',
        label: 'Create Joint',
        icon: Link2,
        shortcut: 'J',
        disabled: isSimulating,
        action: () => {
          useToolModeStore.getState().setMode('create-joint');
          useJointCreationStore.getState().startCreation();
        },
      },
      {
        id: 'authoring.import-cad',
        label: 'Import CAD File',
        icon: Import,
        disabled: !isReady,
        action: async () => {
          if (!window.motionlab?.openFileDialog) return;
          const filePath = await window.motionlab.openFileDialog({
            filters: [
              { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });
          if (filePath) sendImportAsset(filePath);
        },
      },
    ],
  };
}
