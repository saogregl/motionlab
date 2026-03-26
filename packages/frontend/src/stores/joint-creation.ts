import { create } from 'zustand';

import type { JointTypeId } from './mechanism.js';
import type { AlignmentKind, DatumAlignment } from '../utils/datum-alignment.js';

export type JointCreationStep = 'idle' | 'pick-parent' | 'pick-child' | 'select-type' | 'configure';

export type SurfaceClassId = 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'toroidal' | 'other';

export interface JointCreationState {
  step: JointCreationStep;
  parentDatumId: string | null;
  childDatumId: string | null;
  /** Surface class of the face used to create the parent datum (if face-created). */
  parentSurfaceClass: SurfaceClassId | null;
  /** Surface class of the face used to create the child datum (if face-created). */
  childSurfaceClass: SurfaceClassId | null;
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
  /** Full alignment analysis for semantic preview rendering. */
  alignment: DatumAlignment | null;
  /** True while waiting for async face-to-datum creation result. */
  creatingDatum: boolean;
  /** Non-null when editing an existing joint (vs creating a new one). */
  editingJointId: string | null;

  startCreation: () => void;
  setParentDatum: (id: string, surfaceClass?: SurfaceClassId | null) => void;
  setChildDatum: (id: string, alignment?: DatumAlignment, surfaceClass?: SurfaceClassId | null) => void;
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
  /** Enter edit mode for an existing joint — skips to select-type with pre-populated data. */
  editExisting: (jointId: string, parentDatumId: string, childDatumId: string, currentType: JointTypeId) => void;
}

const initialState = {
  step: 'idle' as JointCreationStep,
  parentDatumId: null as string | null,
  childDatumId: null as string | null,
  parentSurfaceClass: null as SurfaceClassId | null,
  childSurfaceClass: null as SurfaceClassId | null,
  preselectedJointType: null as string | null,
  previewJointType: null as JointTypeId | null,
  selectedJointType: null as JointTypeId | null,
  recommendedTypes: [] as JointTypeId[],
  alignmentKind: null as AlignmentKind | null,
  alignment: null as DatumAlignment | null,
  creatingDatum: false,
  editingJointId: null as string | null,
};

export const useJointCreationStore = create<JointCreationState>()((set, get) => ({
  ...initialState,

  startCreation: () =>
    set({
      step: 'pick-parent',
      parentDatumId: null,
      childDatumId: null,
      parentSurfaceClass: null,
      childSurfaceClass: null,
      previewJointType: null,
      selectedJointType: null,
      recommendedTypes: [],
      alignmentKind: null,
      alignment: null,
      creatingDatum: false,
      editingJointId: null,
    }),

  setParentDatum: (id, surfaceClass?) => set({ step: 'pick-child', parentDatumId: id, parentSurfaceClass: surfaceClass ?? null }),

  setChildDatum: (id, alignment?, surfaceClass?) => {
    const { preselectedJointType } = get();
    const recommendedTypes = alignment?.recommendedTypes ?? [];
    const alignmentKind = alignment?.kind ?? null;
    // Auto-select: preselected type takes priority, then first recommendation
    const selectedJointType =
      (preselectedJointType as JointTypeId | null) ?? recommendedTypes[0] ?? null;
    set({
      step: 'select-type',
      childDatumId: id,
      childSurfaceClass: surfaceClass ?? null,
      recommendedTypes,
      alignmentKind,
      alignment: alignment ?? null,
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
          childSurfaceClass: null,
          recommendedTypes: [],
          alignmentKind: null,
          alignment: null,
          selectedJointType: null,
          previewJointType: null,
        });
        break;
      case 'pick-child':
        // Back to pick-parent: clear parent
        set({ step: 'pick-parent', parentDatumId: null, parentSurfaceClass: null });
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
      parentSurfaceClass: null,
      childSurfaceClass: null,
      previewJointType: null,
      selectedJointType: null,
      recommendedTypes: [],
      alignmentKind: null,
      alignment: null,
      preselectedJointType: null,
      creatingDatum: false,
      editingJointId: null,
    }),

  exitMode: () => set({ ...initialState }),

  editExisting: (jointId, parentDatumId, childDatumId, currentType) =>
    set({
      step: 'select-type',
      editingJointId: jointId,
      parentDatumId,
      childDatumId,
      selectedJointType: currentType,
      previewJointType: null,
      recommendedTypes: [],
      alignmentKind: null,
      alignment: null,
      creatingDatum: false,
      preselectedJointType: null,
    }),
}));
