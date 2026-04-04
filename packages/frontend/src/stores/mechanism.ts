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
  massProperties: BodyMassProperties;
  pose: BodyPose;
  isFixed?: boolean;           // deprecated — use motionType
  motionType: 'dynamic' | 'fixed';
  massOverride?: boolean;
}

export interface GeometryState {
  id: string;
  name: string;
  parentBodyId: string | null;
  localPose: BodyPose;
  meshData: MeshData;
  partIndex?: Uint32Array;
  computedMassProperties: BodyMassProperties;
  sourceAssetRef: { contentHash: string; originalFilename: string };
  primitiveSource?: {
    shape: 'box' | 'cylinder' | 'sphere';
    params: {
      box?: { width: number; height: number; depth: number };
      cylinder?: { radius: number; height: number };
      sphere?: { radius: number };
    };
  };
  collisionConfig?: {
    shapeType: 'none' | 'box' | 'sphere' | 'cylinder' | 'convex-hull';
    halfExtents: { x: number; y: number; z: number };
    radius: number;
    height: number;
    offset: { x: number; y: number; z: number };
  };
}

export interface FaceGeometryInfo {
  axisDirection?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  radius?: number;
  secondaryRadius?: number;
  semiAngle?: number;
}

export type DatumSurfaceClassId =
  | 'planar'
  | 'cylindrical'
  | 'conical'
  | 'spherical'
  | 'toroidal'
  | 'other';

export interface DatumState {
  id: string;
  name: string;
  parentBodyId: string;
  localPose: BodyPose;
  sourceGeometryId?: string;
  sourceFaceIndex?: number;
  sourceGeometryLocalPose?: BodyPose;
  surfaceClass?: DatumSurfaceClassId;
  faceGeometry?: FaceGeometryInfo;
}

export type JointTypeId = 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar' | 'universal' | 'distance' | 'point-line' | 'point-plane';

export interface JointState {
  id: string;
  name: string;
  type: JointTypeId;
  parentDatumId: string;
  childDatumId: string;
  lowerLimit: number;
  upperLimit: number;
  damping: number;
  translationalDamping: number;
  rotationalDamping: number;
}

export type LoadTypeId = 'point-force' | 'point-torque' | 'spring-damper';
export type ReferenceFrameId = 'datum-local' | 'world';

export interface LoadState {
  id: string;
  name: string;
  type: LoadTypeId;
  /** Datum for point force / point torque */
  datumId?: string;
  vector?: { x: number; y: number; z: number };
  referenceFrame?: ReferenceFrameId;
  /** Spring-damper parent datum */
  parentDatumId?: string;
  /** Spring-damper child datum */
  childDatumId?: string;
  restLength?: number;
  stiffness?: number;
  damping?: number;
}

export type ActuatorTypeId = 'revolute-motor' | 'prismatic-motor';
export type ControlModeId = 'position' | 'speed' | 'effort';

export type CommandFunctionShape =
  | { shape: 'constant'; value: number }
  | { shape: 'ramp'; initialValue: number; slope: number }
  | { shape: 'sine'; amplitude: number; frequency: number; phase: number; offset: number }
  | { shape: 'piecewise-linear'; times: number[]; values: number[] }
  | { shape: 'smooth-step'; displacement: number; duration: number; profile: 'cycloidal' | 'trapezoidal'; accelFraction: number; decelFraction: number };

export type CommandFunctionShapeId = CommandFunctionShape['shape'];

export interface ActuatorState {
  id: string;
  name: string;
  type: ActuatorTypeId;
  jointId: string;
  controlMode: ControlModeId;
  commandValue: number;
  commandFunction: CommandFunctionShape;
  effortLimit?: number;
}

export type SensorTypeId = 'accelerometer' | 'gyroscope' | 'tachometer' | 'encoder';
export type SensorAxisId = 'x' | 'y' | 'z';

export interface SensorState {
  id: string;
  name: string;
  type: SensorTypeId;
  datumId: string;
  axis?: SensorAxisId;   // tachometer axis
  jointId?: string;       // encoder target joint
}

export interface MechanismState {
  bodies: Map<string, BodyState>;
  geometries: Map<string, GeometryState>;
  datums: Map<string, DatumState>;
  joints: Map<string, JointState>;
  loads: Map<string, LoadState>;
  actuators: Map<string, ActuatorState>;
  sensors: Map<string, SensorState>;
  importing: boolean;
  importError: string | null;
  hasActiveProject: boolean;
  projectName: string;
  projectFilePath: string | null;
  isDirty: boolean;
  addBodies: (bodies: BodyState[]) => void;
  removeBody: (id: string) => void;
  addGeometries: (geometries: GeometryState[]) => void;
  removeGeometry: (id: string) => void;
  updateGeometryParent: (id: string, parentBodyId: string | null) => void;
  updateGeometry: (id: string, updates: Partial<Omit<GeometryState, 'id'>>) => void;
  updateBodyMass: (id: string, massProperties: BodyMassProperties, massOverride: boolean) => void;
  addBodiesWithGeometries: (bodies: BodyState[], geometries: GeometryState[]) => void;
  addDatum: (datum: DatumState) => void;
  removeDatum: (id: string) => void;
  renameDatum: (id: string, name: string) => void;
  updateDatumPose: (id: string, localPose: DatumState['localPose']) => void;
  addJoint: (joint: JointState) => void;
  updateJoint: (id: string, updates: Partial<Omit<JointState, 'id'>>) => void;
  removeJoint: (id: string) => void;
  addLoad: (load: LoadState) => void;
  updateLoad: (id: string, updates: Partial<Omit<LoadState, 'id'>>) => void;
  removeLoad: (id: string) => void;
  addActuator: (actuator: ActuatorState) => void;
  updateActuator: (id: string, updates: Partial<Omit<ActuatorState, 'id'>>) => void;
  removeActuator: (id: string) => void;
  addSensor: (sensor: SensorState) => void;
  updateSensor: (id: string, updates: Partial<Omit<SensorState, 'id'>>) => void;
  removeSensor: (id: string) => void;
  clear: () => void;
  resetProject: (projectName?: string) => void;
  setImporting: (v: boolean) => void;
  setImportError: (e: string | null) => void;
  setProjectMeta: (name: string, filePath: string | null) => void;
  markDirty: () => void;
  markClean: () => void;

  // Trigger inline rename on a newly created entity
  pendingRenameEntityId: string | null;
  setPendingRenameEntityId: (id: string | null) => void;
}

export const useMechanismStore = create<MechanismState>()((set) => ({
  bodies: new Map<string, BodyState>(),
  geometries: new Map<string, GeometryState>(),
  datums: new Map<string, DatumState>(),
  joints: new Map<string, JointState>(),
  loads: new Map<string, LoadState>(),
  actuators: new Map<string, ActuatorState>(),
  sensors: new Map<string, SensorState>(),
  importing: false,
  importError: null,
  hasActiveProject: false,
  projectName: 'Untitled',
  projectFilePath: null,
  isDirty: false,
  pendingRenameEntityId: null,
  setPendingRenameEntityId: (id) => set({ pendingRenameEntityId: id }),

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

  addGeometries: (geometries) =>
    set((state) => {
      const next = new Map(state.geometries);
      for (const geom of geometries) {
        next.set(geom.id, geom);
      }
      return { geometries: next, isDirty: true };
    }),

  removeGeometry: (id) =>
    set((state) => {
      const next = new Map(state.geometries);
      next.delete(id);
      return { geometries: next, isDirty: true };
    }),

  updateGeometryParent: (id, parentBodyId) =>
    set((state) => {
      const existing = state.geometries.get(id);
      if (!existing) return {};
      const next = new Map(state.geometries);
      next.set(id, { ...existing, parentBodyId });
      return { geometries: next, isDirty: true };
    }),

  updateGeometry: (id, updates) =>
    set((state) => {
      const existing = state.geometries.get(id);
      if (!existing) return {};
      const next = new Map(state.geometries);
      next.set(id, { ...existing, ...updates });
      return { geometries: next, isDirty: true };
    }),

  updateBodyMass: (id, massProperties, massOverride) =>
    set((state) => {
      const existing = state.bodies.get(id);
      if (!existing) return {};
      const next = new Map(state.bodies);
      next.set(id, { ...existing, massProperties, massOverride });
      return { bodies: next, isDirty: true };
    }),

  addBodiesWithGeometries: (bodies, geometries) =>
    set((state) => {
      const nextBodies = new Map(state.bodies);
      for (const body of bodies) {
        nextBodies.set(body.id, body);
      }
      const nextGeometries = new Map(state.geometries);
      for (const geom of geometries) {
        nextGeometries.set(geom.id, geom);
      }
      return { bodies: nextBodies, geometries: nextGeometries, isDirty: true };
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

  addLoad: (load) =>
    set((state) => {
      const next = new Map(state.loads);
      next.set(load.id, load);
      return { loads: next, isDirty: true };
    }),

  updateLoad: (id, updates) =>
    set((state) => {
      const existing = state.loads.get(id);
      if (!existing) return {};
      const next = new Map(state.loads);
      next.set(id, { ...existing, ...updates });
      return { loads: next, isDirty: true };
    }),

  removeLoad: (id) =>
    set((state) => {
      const next = new Map(state.loads);
      next.delete(id);
      return { loads: next, isDirty: true };
    }),

  addActuator: (actuator) =>
    set((state) => {
      const next = new Map(state.actuators);
      next.set(actuator.id, actuator);
      return { actuators: next, isDirty: true };
    }),

  updateActuator: (id, updates) =>
    set((state) => {
      const existing = state.actuators.get(id);
      if (!existing) return {};
      const next = new Map(state.actuators);
      next.set(id, { ...existing, ...updates });
      return { actuators: next, isDirty: true };
    }),

  removeActuator: (id) =>
    set((state) => {
      const next = new Map(state.actuators);
      next.delete(id);
      return { actuators: next, isDirty: true };
    }),

  addSensor: (sensor) =>
    set((state) => {
      const next = new Map(state.sensors);
      next.set(sensor.id, sensor);
      return { sensors: next, isDirty: true };
    }),

  updateSensor: (id, updates) =>
    set((state) => {
      const existing = state.sensors.get(id);
      if (!existing) return {};
      const next = new Map(state.sensors);
      next.set(id, { ...existing, ...updates });
      return { sensors: next, isDirty: true };
    }),

  removeSensor: (id) =>
    set((state) => {
      const next = new Map(state.sensors);
      next.delete(id);
      return { sensors: next, isDirty: true };
    }),

  clear: () =>
    set({
      bodies: new Map<string, BodyState>(),
      geometries: new Map<string, GeometryState>(),
      datums: new Map<string, DatumState>(),
      joints: new Map<string, JointState>(),
      loads: new Map<string, LoadState>(),
      actuators: new Map<string, ActuatorState>(),
      sensors: new Map<string, SensorState>(),
      importError: null,
      pendingRenameEntityId: null,
    }),

  resetProject: (projectName = 'Untitled') =>
    set({
      bodies: new Map<string, BodyState>(),
      geometries: new Map<string, GeometryState>(),
      datums: new Map<string, DatumState>(),
      joints: new Map<string, JointState>(),
      loads: new Map<string, LoadState>(),
      actuators: new Map<string, ActuatorState>(),
      sensors: new Map<string, SensorState>(),
      importError: null,
      hasActiveProject: true,
      projectName,
      projectFilePath: null,
      isDirty: false,
      pendingRenameEntityId: null,
    }),

  setImporting: (v) => set({ importing: v }),

  setImportError: (e) => set({ importError: e }),

  setProjectMeta: (name, filePath) => set({
    hasActiveProject: true,
    projectName: name,
    projectFilePath: filePath,
  }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),
}));
