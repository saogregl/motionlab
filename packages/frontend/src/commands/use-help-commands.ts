import { FolderOpen, Info, Keyboard } from 'lucide-react';

import { useDialogStore } from '../stores/dialogs.js';
import type { CommandGroup } from './types.js';

export function useHelpCommands(): CommandGroup {
  return {
    id: 'help',
    heading: 'Help',
    commands: [
      {
        id: 'help.shortcuts',
        label: 'Keyboard Shortcuts',
        icon: Keyboard,
        action: () => useDialogStore.getState().open('shortcuts'),
      },
      {
        id: 'help.show-logs',
        label: 'Show Logs Folder',
        icon: FolderOpen,
        action: () => window.motionlab?.showLogsFolder(),
      },
      {
        id: 'help.about',
        label: 'About MotionLab',
        icon: Info,
        action: () => useDialogStore.getState().open('about'),
      },
    ],
  };
}
