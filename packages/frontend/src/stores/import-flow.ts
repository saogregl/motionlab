import { create } from 'zustand';

import { useMechanismStore } from './mechanism.js';

interface ImportFlowState {
  pendingFilePath: string | null;
  openImportDialog: (filePath: string) => void;
  closeImportDialog: () => void;
}

export const useImportFlowStore = create<ImportFlowState>()((set) => ({
  pendingFilePath: null,
  openImportDialog: (filePath) => set({ pendingFilePath: filePath }),
  closeImportDialog: () => set({ pendingFilePath: null }),
}));

export async function beginImportFlow(): Promise<void> {
  if (!window.motionlab?.openFileDialog) return;

  try {
    const filePath = await window.motionlab.openFileDialog({
      filters: [
        { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!filePath) return;
    useImportFlowStore.getState().openImportDialog(filePath);
  } catch {
    useMechanismStore.getState().setImportError('Failed to open file dialog');
  }
}
