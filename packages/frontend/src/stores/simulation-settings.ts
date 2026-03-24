import { create } from 'zustand';

export type SolverType = 'psor' | 'barzilai-borwein' | 'apgd' | 'minres';
export type IntegratorType = 'euler-implicit-linearized' | 'hht' | 'newmark';
export type SettingsPreset = 'quick-preview' | 'balanced' | 'high-accuracy' | 'contact-heavy';

export interface SimulationSettingsState {
  // Basic
  duration: number;
  timestep: number;
  gravity: { x: number; y: number; z: number };

  // Solver (advanced)
  solverType: SolverType;
  maxIterations: number;
  tolerance: number;
  integratorType: IntegratorType;

  // Contact (advanced)
  friction: number;
  restitution: number;
  compliance: number;
  contactDamping: number;
  enableContact: boolean;

  // Actions
  setDuration: (v: number) => void;
  setTimestep: (v: number) => void;
  setGravity: (g: { x: number; y: number; z: number }) => void;
  setSolverType: (v: SolverType) => void;
  setMaxIterations: (v: number) => void;
  setTolerance: (v: number) => void;
  setIntegratorType: (v: IntegratorType) => void;
  setFriction: (v: number) => void;
  setRestitution: (v: number) => void;
  setCompliance: (v: number) => void;
  setContactDamping: (v: number) => void;
  setEnableContact: (v: boolean) => void;
  applyPreset: (preset: 'earth' | 'moon' | 'mars' | 'zero-g') => void;
  applySettingsPreset: (preset: SettingsPreset) => void;
  resetToDefaults: () => void;
}

const GRAVITY_PRESETS = {
  earth: { x: 0, y: -9.81, z: 0 },
  moon: { x: 0, y: -1.62, z: 0 },
  mars: { x: 0, y: -3.72, z: 0 },
  'zero-g': { x: 0, y: 0, z: 0 },
} as const;

const DEFAULTS = {
  duration: 10.0,
  timestep: 0.001,
  gravity: { x: 0, y: -9.81, z: 0 },
  solverType: 'psor' as SolverType,
  maxIterations: 100,
  tolerance: 1e-8,
  integratorType: 'euler-implicit-linearized' as IntegratorType,
  friction: 0.3,
  restitution: 0.0,
  compliance: 0.0,
  contactDamping: 0.0,
  enableContact: true,
};

const SETTINGS_PRESETS: Record<SettingsPreset, Partial<SimulationSettingsState>> = {
  'quick-preview': {
    timestep: 0.01,
    solverType: 'psor',
    maxIterations: 30,
    tolerance: 1e-6,
    integratorType: 'euler-implicit-linearized',
  },
  'balanced': {
    timestep: 0.001,
    solverType: 'psor',
    maxIterations: 100,
    tolerance: 1e-8,
    integratorType: 'euler-implicit-linearized',
  },
  'high-accuracy': {
    timestep: 0.0005,
    solverType: 'apgd',
    maxIterations: 500,
    tolerance: 1e-10,
    integratorType: 'hht',
  },
  'contact-heavy': {
    timestep: 0.001,
    solverType: 'barzilai-borwein',
    maxIterations: 200,
    tolerance: 1e-8,
    integratorType: 'euler-implicit-linearized',
    friction: 0.5,
    restitution: 0.1,
    compliance: 1e-5,
    contactDamping: 1e-4,
    enableContact: true,
  },
};

export const useSimulationSettingsStore = create<SimulationSettingsState>()((set) => ({
  ...DEFAULTS,
  setDuration: (v) => set({ duration: v }),
  setTimestep: (v) => set({ timestep: v }),
  setGravity: (g) => set({ gravity: g }),
  setSolverType: (v) => set({ solverType: v }),
  setMaxIterations: (v) => set({ maxIterations: v }),
  setTolerance: (v) => set({ tolerance: v }),
  setIntegratorType: (v) => set({ integratorType: v }),
  setFriction: (v) => set({ friction: v }),
  setRestitution: (v) => set({ restitution: v }),
  setCompliance: (v) => set({ compliance: v }),
  setContactDamping: (v) => set({ contactDamping: v }),
  setEnableContact: (v) => set({ enableContact: v }),
  applyPreset: (preset) => set({ gravity: { ...GRAVITY_PRESETS[preset] } }),
  applySettingsPreset: (preset) => set(SETTINGS_PRESETS[preset]),
  resetToDefaults: () => set({ ...DEFAULTS }),
}));
