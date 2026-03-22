import { create } from 'zustand';

export interface SimulationSettingsState {
  timestep: number;
  gravity: { x: number; y: number; z: number };
  setTimestep: (v: number) => void;
  setGravity: (g: { x: number; y: number; z: number }) => void;
  applyPreset: (preset: 'earth' | 'moon' | 'mars' | 'zero-g') => void;
}

const GRAVITY_PRESETS = {
  earth: { x: 0, y: -9.81, z: 0 },
  moon: { x: 0, y: -1.62, z: 0 },
  mars: { x: 0, y: -3.72, z: 0 },
  'zero-g': { x: 0, y: 0, z: 0 },
} as const;

export const useSimulationSettingsStore = create<SimulationSettingsState>()((set) => ({
  timestep: 0.001,
  gravity: { x: 0, y: -9.81, z: 0 },
  setTimestep: (v) => set({ timestep: v }),
  setGravity: (g) => set({ gravity: g }),
  applyPreset: (preset) => set({ gravity: { ...GRAVITY_PRESETS[preset] } }),
}));
