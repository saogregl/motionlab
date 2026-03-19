import { create } from 'zustand';

export type SimState = 'idle' | 'compiling' | 'running' | 'paused' | 'error';

interface SimulationState {
  state: SimState;
  simTime: number;
  stepCount: number;
  errorMessage: string | null;
  compilationDiagnostics: string[];
  setCompilationResult(success: boolean, error?: string, diagnostics?: string[]): void;
  setSimState(state: SimState, time: number, stepCount: number): void;
  setError(message: string): void;
  reset(): void;
}

export const useSimulationStore = create<SimulationState>()((set) => ({
  state: 'idle',
  simTime: 0,
  stepCount: 0,
  errorMessage: null,
  compilationDiagnostics: [],
  setCompilationResult: (success, error, diagnostics) =>
    set({
      state: success ? 'paused' : 'error',
      errorMessage: success ? null : (error ?? 'Compilation failed'),
      compilationDiagnostics: diagnostics ?? [],
    }),
  setSimState: (state, time, stepCount) =>
    set({ state, simTime: time, stepCount }),
  setError: (message) =>
    set({ state: 'error', errorMessage: message }),
  reset: () =>
    set({
      state: 'idle',
      simTime: 0,
      stepCount: 0,
      errorMessage: null,
      compilationDiagnostics: [],
    }),
}));
