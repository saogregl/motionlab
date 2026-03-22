import { create } from 'zustand';

export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
}

export interface BodyMassProperties {
  mass: number;
  centerOfMass: { x: number; y: number; z: number };
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
}

export interface BodyPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

export interface BodyState {
  id: string;
  name: string;
  meshData: MeshData;
  partIndex?: Uint32Array;
  massProperties: BodyMassProperties;
  pose: BodyPose;
  sourceAssetRef: { contentHash: string; originalFilename: string };
  isFixed?: boolean;
}

export interface DatumState {
  id: string;
  name: string;
  parentBodyId: string;
  localPose: BodyPose;
}

export type JointTypeId = 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar';

export interface JointState {
  id: string;
  name: string;
  type: JointTypeId;
  parentDatumId: string;
  childDatumId: string;
  lowerLimit: number;
  upperLimit: number;
}

export interface MechanismState {
  bodies: Map<string, BodyState>;
  datums: Map<string, DatumState>;
  joints: Map<string, JointState>;
  importing: boolean;
  importError: string | null;
  projectName: string;
  projectFilePath: string | null;
  isDirty: boolean;
  addBodies: (bodies: BodyState[]) => void;
  removeBody: (id: string) => void;
  addDatum: (datum: DatumState) => void;
  removeDatum: (id: string) => void;
  renameDatum: (id: string, name: string) => void;
  updateDatumPose: (id: string, localPose: DatumState['localPose']) => void;
  addJoint: (joint: JointState) => void;
  updateJoint: (id: string, updates: Partial<Omit<JointState, 'id'>>) => void;
  removeJoint: (id: string) => void;
  clear: () => void;
  setImporting: (v: boolean) => void;
  setImportError: (e: string | null) => void;
  setProjectMeta: (name: string, filePath: string | null) => void;
  markDirty: () => void;
  markClean: () => void;
}

export const useMechanismStore = create<MechanismState>()((set) => ({
  bodies: new Map<string, BodyState>(),
  datums: new Map<string, DatumState>(),
  joints: new Map<string, JointState>(),
  importing: false,
  importError: null,
  projectName: 'Untitled',
  projectFilePath: null,
  isDirty: false,

  addBodies: (bodies) =>
    set((state) => {
      const next = new Map(state.bodies);
      for (const body of bodies) {
        next.set(body.id, body);
      }
      return { bodies: next, isDirty: true };
    }),

  removeBody: (id) =>
    set((state) => {
      const next = new Map(state.bodies);
      next.delete(id);
      return { bodies: next, isDirty: true };
    }),

  addDatum: (datum) =>
    set((state) => {
      const next = new Map(state.datums);
      next.set(datum.id, datum);
      return { datums: next, isDirty: true };
    }),

  removeDatum: (id) =>
    set((state) => {
      const next = new Map(state.datums);
      next.delete(id);
      return { datums: next, isDirty: true };
    }),

  renameDatum: (id, name) =>
    set((state) => {
      const existing = state.datums.get(id);
      if (!existing) return {};
      const next = new Map(state.datums);
      next.set(id, { ...existing, name });
      return { datums: next, isDirty: true };
    }),

  updateDatumPose: (id, localPose) =>
    set((state) => {
      const existing = state.datums.get(id);
      if (!existing) return {};
      const next = new Map(state.datums);
      next.set(id, { ...existing, localPose });
      return { datums: next, isDirty: true };
    }),

  addJoint: (joint) =>
    set((state) => {
      const next = new Map(state.joints);
      next.set(joint.id, joint);
      return { joints: next, isDirty: true };
    }),

  updateJoint: (id, updates) =>
    set((state) => {
      const existing = state.joints.get(id);
      if (!existing) return {};
      const next = new Map(state.joints);
      next.set(id, { ...existing, ...updates });
      return { joints: next, isDirty: true };
    }),

  removeJoint: (id) =>
    set((state) => {
      const next = new Map(state.joints);
      next.delete(id);
      return { joints: next, isDirty: true };
    }),

  clear: () =>
    set({
      bodies: new Map<string, BodyState>(),
      datums: new Map<string, DatumState>(),
      joints: new Map<string, JointState>(),
      importError: null,
    }),

  setImporting: (v) => set({ importing: v }),

  setImportError: (e) => set({ importError: e }),

  setProjectMeta: (name, filePath) => set({ projectName: name, projectFilePath: filePath }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),
}));
