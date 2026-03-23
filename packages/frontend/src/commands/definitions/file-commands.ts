import { FilePlus, FolderOpen, Import, Save, SaveAll } from 'lucide-react';

import { sendLoadProject, sendNewProject, sendSaveProject, sendSaveProjectAs } from '../../engine/connection.js';
import { useEngineConnection } from '../../stores/engine-connection.js';
import { beginImportFlow } from '../../stores/import-flow.js';
import { useMechanismStore } from '../../stores/mechanism.js';
import { guardDirtyState } from '../dirty-guard.js';
import type { CommandDef } from '../types.js';

export function createFileCommands(): CommandDef[] {
  const isEngineReady = () => useEngineConnection.getState().status === 'ready';

  return [
    {
      id: 'file.new',
      label: 'New Project',
      icon: FilePlus,
      category: 'file',
      shortcut: 'Ctrl+N',
      enabled: isEngineReady,
      execute: async () => {
        const result = await guardDirtyState();
        if (result === 'cancel') return;
        sendNewProject('Untitled');
      },
    },
    {
      id: 'file.open',
      label: 'Open Project',
      icon: FolderOpen,
      category: 'file',
      shortcut: 'Ctrl+O',
      enabled: isEngineReady,
      execute: async () => {
        const result = await guardDirtyState();
        if (result === 'cancel') return;
        if (!window.motionlab) return;
        const file = await window.motionlab.openProjectFile();
        if (!file) return;
        sendLoadProject(file.data);
      },
    },
    {
      id: 'file.save',
      label: 'Save Project',
      icon: Save,
      category: 'file',
      shortcut: 'Ctrl+S',
      enabled: isEngineReady,
      execute: () => {
        sendSaveProject(useMechanismStore.getState().projectName);
      },
    },
    {
      id: 'file.save-as',
      label: 'Save As',
      icon: SaveAll,
      category: 'file',
      shortcut: 'Ctrl+Shift+S',
      enabled: isEngineReady,
      execute: () => {
        sendSaveProjectAs(useMechanismStore.getState().projectName);
      },
    },
    {
      id: 'file.import-cad',
      label: 'Import CAD File',
      icon: Import,
      category: 'file',
      enabled: () => isEngineReady() && !useMechanismStore.getState().importing,
      execute: beginImportFlow,
    },
  ];
}
