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
  massProperties: BodyMassProperties;
  pose: BodyPose;
  sourceAssetRef: { contentHash: string; originalFilename: string };
}

export interface MechanismState {
  bodies: Map<string, BodyState>;
  importing: boolean;
  importError: string | null;
  addBodies: (bodies: BodyState[]) => void;
  removeBody: (id: string) => void;
  clear: () => void;
  setImporting: (v: boolean) => void;
  setImportError: (e: string | null) => void;
}

export const useMechanismStore = create<MechanismState>()((set) => ({
  bodies: new Map<string, BodyState>(),
  importing: false,
  importError: null,

  addBodies: (bodies) =>
    set((state) => {
      const next = new Map(state.bodies);
      for (const body of bodies) {
        next.set(body.id, body);
      }
      return { bodies: next };
    }),

  removeBody: (id) =>
    set((state) => {
      const next = new Map(state.bodies);
      next.delete(id);
      return { bodies: next };
    }),

  clear: () => set({ bodies: new Map<string, BodyState>(), importError: null }),

  setImporting: (v) => set({ importing: v }),

  setImportError: (e) => set({ importError: e }),
}));
