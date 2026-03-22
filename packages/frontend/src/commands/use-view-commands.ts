import { MousePointer2 } from 'lucide-react';

import { useToolModeStore } from '../stores/tool-mode.js';
import type { CommandGroup } from './types.js';

export function useViewCommands(): CommandGroup {
  return {
    id: 'view',
    heading: 'View',
    commands: [
      {
        id: 'view.select-mode',
        label: 'Select Mode',
        icon: MousePointer2,
        shortcut: 'V',
        action: () => useToolModeStore.getState().setMode('select'),
      },
    ],
  };
}
