import { BoxSelect, Redo2, Trash2, Undo2, X } from 'lucide-react';

import { sendDeleteDatum, sendDeleteJoint } from '../../engine/connection.js';
import { useAuthoringStatusStore } from '../../stores/authoring-status.js';
import { useJointCreationStore } from '../../stores/joint-creation.js';
import { useMechanismStore } from '../../stores/mechanism.js';
import { useSelectionStore } from '../../stores/selection.js';
import { useSimulationStore } from '../../stores/simulation.js';
import { useToolModeStore } from '../../stores/tool-mode.js';
import type { CommandDef } from '../types.js';

export function createEditCommands(): CommandDef[] {
  const notSimulating = () => {
    const s = useSimulationStore.getState().state;
    return s !== 'running' && s !== 'paused';
  };

  return [
    {
      id: 'edit.undo',
      label: 'Undo',
      icon: Undo2,
      category: 'edit',
      shortcut: 'Ctrl+Z',
      enabled: () => false,
      execute: () => {
        // Stub — undo not yet implemented
      },
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      icon: Redo2,
      category: 'edit',
      shortcut: 'Ctrl+Shift+Z',
      enabled: () => false,
      execute: () => {
        // Stub — redo not yet implemented
      },
    },
    {
      id: 'edit.cancel',
      label: 'Cancel / Select Mode',
      icon: X,
      category: 'edit',
      shortcut: 'Escape',
      execute: () => {
        const mode = useToolModeStore.getState().activeMode;
        if (mode === 'create-joint') {
          const { step } = useJointCreationStore.getState();
          // Single-level undo: select-type → pick-child → pick-parent → exit
          if (step === 'select-type' || step === 'pick-child') {
            useJointCreationStore.getState().cancel();
            return;
          }
          // pick-parent or idle: fall through to exit mode entirely
        }
        // Fall through: go to select mode and clear selection
        useSelectionStore.getState().clearSelection();
        useToolModeStore.getState().setMode('select');
        useJointCreationStore.getState().exitMode();
        useAuthoringStatusStore.getState().clearMessage();
      },
    },
    {
      id: 'edit.select-all',
      label: 'Select All',
      icon: BoxSelect,
      category: 'edit',
      shortcut: 'Ctrl+A',
      execute: () => {
        const { bodies, datums, joints } = useMechanismStore.getState();
        const allIds = [...bodies.keys(), ...datums.keys(), ...joints.keys()];
        useSelectionStore.getState().selectAll(allIds);
      },
    },
    {
      id: 'edit.delete',
      label: 'Delete Selected',
      icon: Trash2,
      category: 'edit',
      shortcut: 'Delete, Backspace',
      enabled: () => notSimulating() && useSelectionStore.getState().selectedIds.size > 0,
      execute: () => {
        const { selectedIds } = useSelectionStore.getState();
        const { datums, joints } = useMechanismStore.getState();
        for (const id of selectedIds) {
          if (joints.has(id)) {
            sendDeleteJoint(id);
          } else if (datums.has(id)) {
            sendDeleteDatum(id);
          }
        }
        if (selectedIds.size > 0) {
          useSelectionStore.getState().clearSelection();
        }
      },
    },
  ];
}
