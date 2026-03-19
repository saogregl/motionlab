import { create } from 'zustand';

export type JointCreationStep = 'idle' | 'pick-parent' | 'pick-child' | 'configure';

export interface JointCreationState {
  step: JointCreationStep;
  parentDatumId: string | null;
  childDatumId: string | null;

  startCreation: () => void;
  setParentDatum: (id: string) => void;
  setChildDatum: (id: string) => void;
  cancel: () => void;
  reset: () => void;
}

export const useJointCreationStore = create<JointCreationState>()((set) => ({
  step: 'idle',
  parentDatumId: null,
  childDatumId: null,

  startCreation: () => set({ step: 'pick-parent', parentDatumId: null, childDatumId: null }),

  setParentDatum: (id) => set({ step: 'pick-child', parentDatumId: id }),

  setChildDatum: (id) => set({ step: 'configure', childDatumId: id }),

  cancel: () => set({ step: 'pick-parent', parentDatumId: null, childDatumId: null }),

  reset: () => set({ step: 'pick-parent', parentDatumId: null, childDatumId: null }),
}));
