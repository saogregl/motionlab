import { create } from 'zustand';

import type { LoadTypeId } from './mechanism.js';

export type LoadCreationStep = 'idle' | 'pick-datum' | 'pick-second-datum' | 'configure';

export interface LoadCreationState {
  step: LoadCreationStep;
  preselectedLoadType: LoadTypeId | null;
  datumId: string | null;
  secondDatumId: string | null;
  creatingDatum: boolean;

  startCreation: () => void;
  setDatum: (id: string) => void;
  setSecondDatum: (id: string) => void;
  setPreselectedLoadType: (type: LoadTypeId | null) => void;
  beginSecondDatumPick: () => void;
  setCreatingDatum: (v: boolean) => void;
  cancel: () => void;
  reset: () => void;
  exitMode: () => void;
}

export const useLoadCreationStore = create<LoadCreationState>()((set, get) => ({
  step: 'idle',
  preselectedLoadType: null,
  datumId: null,
  secondDatumId: null,
  creatingDatum: false,

  startCreation: () => set({ step: 'pick-datum', datumId: null, secondDatumId: null, creatingDatum: false }),

  setDatum: (id) => {
    const type = get().preselectedLoadType;
    if (type === 'spring-damper') {
      set({ step: 'pick-second-datum', datumId: id, secondDatumId: null, creatingDatum: false });
    } else {
      set({ step: 'configure', datumId: id, creatingDatum: false });
    }
  },

  setSecondDatum: (id) => set({ step: 'configure', secondDatumId: id, creatingDatum: false }),

  setPreselectedLoadType: (type) => set({ preselectedLoadType: type }),

  beginSecondDatumPick: () =>
    set((state) =>
      state.datumId
        ? { step: 'pick-second-datum', secondDatumId: null }
        : { step: 'pick-datum', secondDatumId: null },
    ),

  setCreatingDatum: (v) => set({ creatingDatum: v }),

  cancel: () =>
    set((state) => {
      if (state.step === 'configure' && state.secondDatumId) {
        return { step: 'pick-second-datum', secondDatumId: null, creatingDatum: false };
      }
      if (state.step === 'configure' || state.step === 'pick-second-datum') {
        return { step: 'pick-datum', datumId: null, secondDatumId: null, creatingDatum: false };
      }
      return state;
    }),

  reset: () =>
    set({
      step: 'pick-datum',
      datumId: null,
      secondDatumId: null,
      preselectedLoadType: null,
      creatingDatum: false,
    }),

  exitMode: () =>
    set({
      step: 'idle',
      datumId: null,
      secondDatumId: null,
      preselectedLoadType: null,
      creatingDatum: false,
    }),
}));
