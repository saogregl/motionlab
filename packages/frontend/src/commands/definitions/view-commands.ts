import {
  BarChart2,
  Eye,
  EyeOff,
  Fullscreen,
  Grid3x3,
  Maximize,
  MousePointer2,
  Move,
  RotateCw,
  Square,
  X,
} from 'lucide-react';

import { getSceneGraph } from '../../engine/connection.js';
import { useAuthoringStatusStore } from '../../stores/authoring-status.js';
import { useJointCreationStore } from '../../stores/joint-creation.js';
import { useLoadCreationStore } from '../../stores/load-creation.js';
import { useSelectionStore } from '../../stores/selection.js';
import { useToolModeStore } from '../../stores/tool-mode.js';
import { useUILayoutStore } from '../../stores/ui-layout.js';
import { useVisibilityStore } from '../../stores/visibility.js';
import type { CommandDef } from '../types.js';

export function createViewCommands(): CommandDef[] {
  return [
    {
      id: 'view.select-mode',
      label: 'Select Mode',
      icon: MousePointer2,
      category: 'view',
      shortcut: 'V',
      execute: () => {
        useToolModeStore.getState().setMode('select');
        useJointCreationStore.getState().exitMode();
        useLoadCreationStore.getState().exitMode();
        useAuthoringStatusStore.getState().clearMessage();
      },
    },
    {
      id: 'view.fit-all',
      label: 'Fit All',
      icon: Maximize,
      category: 'view',
      execute: () => getSceneGraph()?.fitAll(),
    },
    {
      id: 'view.fit-selection',
      label: 'Fit to Selection',
      icon: Fullscreen,
      category: 'view',
      shortcut: 'F',
      execute: () => {
        const { selectedIds } = useSelectionStore.getState();
        if (selectedIds.size === 1) {
          const id = selectedIds.values().next().value as string;
          getSceneGraph()?.focusOnEntity(id);
        } else if (selectedIds.size > 1) {
          getSceneGraph()?.focusOnEntities([...selectedIds]);
        } else {
          getSceneGraph()?.fitAll();
        }
      },
    },
    {
      id: 'view.iso',
      label: 'Isometric View',
      icon: Square,
      category: 'view',
      shortcut: 'Numpad0',
      execute: () => getSceneGraph()?.setCameraPreset('isometric'),
    },
    {
      id: 'view.front',
      label: 'Front View',
      icon: Square,
      category: 'view',
      shortcut: '1',
      execute: () => getSceneGraph()?.setCameraPreset('front'),
    },
    {
      id: 'view.back',
      label: 'Back View',
      icon: Square,
      category: 'view',
      shortcut: '2',
      execute: () => getSceneGraph()?.setCameraPreset('back'),
    },
    {
      id: 'view.left',
      label: 'Left View',
      icon: Square,
      category: 'view',
      shortcut: '3',
      execute: () => getSceneGraph()?.setCameraPreset('left'),
    },
    {
      id: 'view.right',
      label: 'Right View',
      icon: Square,
      category: 'view',
      shortcut: '4',
      execute: () => getSceneGraph()?.setCameraPreset('right'),
    },
    {
      id: 'view.top',
      label: 'Top View',
      icon: Square,
      category: 'view',
      shortcut: '5',
      execute: () => getSceneGraph()?.setCameraPreset('top'),
    },
    {
      id: 'view.bottom',
      label: 'Bottom View',
      icon: Square,
      category: 'view',
      shortcut: '6',
      execute: () => getSceneGraph()?.setCameraPreset('bottom'),
    },
    {
      id: 'view.toggle-grid',
      label: 'Toggle Grid',
      icon: Grid3x3,
      category: 'view',
      shortcut: 'G',
      execute: () => getSceneGraph()?.toggleGrid(),
    },
    {
      id: 'view.gizmo-translate',
      label: 'Translate Gizmo',
      icon: Move,
      category: 'view',
      shortcut: 'W',
      execute: () => useToolModeStore.getState().setGizmoMode('translate'),
    },
    {
      id: 'view.gizmo-rotate',
      label: 'Rotate Gizmo',
      icon: RotateCw,
      category: 'view',
      shortcut: 'E',
      execute: () => useToolModeStore.getState().setGizmoMode('rotate'),
    },
    {
      id: 'view.gizmo-off',
      label: 'Gizmo Off',
      icon: X,
      category: 'view',
      shortcut: 'Q',
      execute: () => useToolModeStore.getState().setGizmoMode('off'),
    },
    {
      id: 'view.toggle-visibility',
      label: 'Toggle Selected Visibility',
      icon: EyeOff,
      category: 'view',
      shortcut: 'H',
      execute: () => {
        const { selectedIds } = useSelectionStore.getState();
        for (const id of selectedIds) {
          useVisibilityStore.getState().toggleVisibility(id);
        }
      },
    },
    {
      id: 'view.toggle-charts',
      label: 'Toggle Charts',
      icon: BarChart2,
      category: 'view',
      shortcut: 'Ctrl+Shift+C',
      execute: () => useUILayoutStore.getState().toggleChartPanel(),
    },
  ];
}
