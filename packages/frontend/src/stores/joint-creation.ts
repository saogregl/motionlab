import { create } from 'zustand';

import type { JointTypeId } from './mechanism.js';

export type AlignmentKind = 'coaxial' | 'coplanar' | 'coincident' | 'general';

export interface DatumAlignment {
  kind: AlignmentKind;
  recommendedTypes: JointTypeId[];
  axis?: { x: number; y: number; z: number };
  distance: number;
}

export type JointCreationStep = 'idle' | 'pick-parent' | 'pick-child' | 'select-type' | 'configure';

export interface JointCreationState {
  step: JointCreationStep;
  parentDatumId: string | null;
  childDatumId: string | null;
  /** Pre-selected joint type from toolbar/command (e.g. 'revolute'). */
  preselectedJointType: string | null;
  /** Currently hovered type in the type selector (for preview). */
  previewJointType: JointTypeId | null;
  /** Confirmed type before commit. */
  selectedJointType: JointTypeId | null;
  /** Joint types ranked by datum alignment, recommended first. */
  recommendedTypes: JointTypeId[];
  /** Detected geometric alignment between parent and child datums. */
  alignmentKind: AlignmentKind | null;
  /** True while waiting for async face-to-datum creation result. */
  creatingDatum: boolean;

  startCreation: () => void;
  setParentDatum: (id: string) => void;
  setChildDatum: (id: string, alignment?: DatumAlignment) => void;
  setPreselectedJointType: (type: string | null) => void;
  setPreviewJointType: (type: JointTypeId | null) => void;
  selectJointType: (type: JointTypeId) => void;
  setCreatingDatum: (v: boolean) => void;
  /** Single-level undo: backs up one step from current. */
  cancel: () => void;
  /** Reset to pick-parent for chaining (after successful creation). */
  reset: () => void;
  /** Full exit: reset everything to idle. */
  exitMode: () => void;
}

const initialState = {
  step: 'idle' as JointCreationStep,
  parentDatumId: null as string | null,
  childDatumId: null as string | null,
  preselectedJointType: null as string | null,
  previewJointType: null as JointTypeId | null,
  selectedJointType: null as JointTypeId | null,
  recommendedTypes: [] as JointTypeId[],
  alignmentKind: null as AlignmentKind | null,
  creatingDatum: false,
};

export const useJointCreationStore = create<JointCreationState>()((set, get) => ({
  ...initialState,

  startCreation: () =>
    set({
      step: 'pick-parent',
      parentDatumId: null,
      childDatumId: null,
      previewJointType: null,
      selectedJointType: null,
      recommendedTypes: [],
      alignmentKind: null,
      creatingDatum: false,
    }),

  setParentDatum: (id) => set({ step: 'pick-child', parentDatumId: id }),

  setChildDatum: (id, alignment?) => {
    const { preselectedJointType } = get();
    const recommendedTypes = alignment?.recommendedTypes ?? [];
    const alignmentKind = alignment?.kind ?? null;
    // Auto-select: preselected type takes priority, then first recommendation
    const selectedJointType =
      (preselectedJointType as JointTypeId | null) ?? recommendedTypes[0] ?? null;
    set({
      step: 'select-type',
      childDatumId: id,
      recommendedTypes,
      alignmentKind,
      selectedJointType,
      previewJointType: null,
    });
  },

  setPreselectedJointType: (type) => set({ preselectedJointType: type }),

  setPreviewJointType: (type) => set({ previewJointType: type }),

  selectJointType: (type) => set({ selectedJointType: type }),

  setCreatingDatum: (v) => set({ creatingDatum: v }),

  cancel: () => {
    const { step } = get();
    switch (step) {
      case 'select-type':
        // Back to pick-child: clear child, alignment, recommendations
        set({
          step: 'pick-child',
          childDatumId: null,
          recommendedTypes: [],
          alignmentKind: null,
          selectedJointType: null,
          previewJointType: null,
        });
        break;
      case 'pick-child':
        // Back to pick-parent: clear parent
        set({ step: 'pick-parent', parentDatumId: null });
        break;
      default:
        // pick-parent or idle: no-op (edit.cancel handles exiting mode)
        break;
    }
  },

  reset: () =>
    set({
      step: 'pick-parent',
      parentDatumId: null,
      childDatumId: null,
      previewJointType: null,
      selectedJointType: null,
      recommendedTypes: [],
      alignmentKind: null,
      preselectedJointType: null,
      creatingDatum: false,
    }),

  exitMode: () => set({ ...initialState }),
}));
