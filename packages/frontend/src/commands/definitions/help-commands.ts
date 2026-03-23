import { Command, FolderOpen, Info, Keyboard } from 'lucide-react';

import { useCommandPaletteStore } from '../../stores/command-palette.js';
import { useDialogStore } from '../../stores/dialogs.js';
import type { CommandDef } from '../types.js';

export function createHelpCommands(): CommandDef[] {
  return [
    {
      id: 'help.shortcuts',
      label: 'Keyboard Shortcuts',
      icon: Keyboard,
      category: 'help',
      execute: () => useDialogStore.getState().open('shortcuts'),
    },
    {
      id: 'help.logs',
      label: 'Show Logs Folder',
      icon: FolderOpen,
      category: 'help',
      execute: () => window.motionlab?.showLogsFolder(),
    },
    {
      id: 'help.about',
      label: 'About MotionLab',
      icon: Info,
      category: 'help',
      execute: () => useDialogStore.getState().open('about'),
    },
    {
      id: 'help.command-palette',
      label: 'Command Palette',
      icon: Command,
      category: 'help',
      shortcut: 'Ctrl+K',
      execute: () => useCommandPaletteStore.getState().openPalette(),
    },
  ];
}
