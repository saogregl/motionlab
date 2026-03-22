import { Settings } from 'lucide-react';

import { useDialogStore } from '../stores/dialogs.js';
import type { CommandGroup } from './types.js';

export function useSettingsCommands(): CommandGroup {
  return {
    id: 'settings',
    heading: 'Settings',
    commands: [
      {
        id: 'settings.sim-settings',
        label: 'Simulation Settings',
        icon: Settings,
        action: () => useDialogStore.getState().open('sim-settings'),
      },
    ],
  };
}
