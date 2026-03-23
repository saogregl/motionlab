import { create } from 'zustand';

import type { LoadTypeId } from './mechanism.js';

export type LoadCreationStep = 'idle' | 'pick-datum' | 'pick-second-datum' | 'configure';

export interface LoadCreationState {
  step: LoadCreationStep;
  preselectedLoadType: LoadTypeId | null;
  datumId: string | null;
  secondDatumId: string | null;

  startCreation: () => void;
  setDatum: (id: string) => void;
  setSecondDatum: (id: string) => void;
  setPreselectedLoadType: (type: LoadTypeId | null) => void;
  cancel: () => void;
  reset: () => void;
}

export const useLoadCreationStore = create<LoadCreationState>()((set, get) => ({
  step: 'idle',
  preselectedLoadType: null,
  datumId: null,
  secondDatumId: null,

  startCreation: () => set({ step: 'pick-datum', datumId: null, secondDatumId: null }),

  setDatum: (id) => {
    const type = get().preselectedLoadType;
    if (type === 'spring-damper') {
      set({ step: 'pick-second-datum', datumId: id });
    } else {
      set({ step: 'configure', datumId: id });
    }
  },

  setSecondDatum: (id) => set({ step: 'configure', secondDatumId: id }),

  setPreselectedLoadType: (type) => set({ preselectedLoadType: type }),

  cancel: () => set({ step: 'pick-datum', datumId: null, secondDatumId: null }),

  reset: () => set({ step: 'pick-datum', datumId: null, secondDatumId: null, preselectedLoadType: null }),
}));
