import { create } from 'zustand';

export type SimState = 'idle' | 'compiling' | 'running' | 'paused' | 'error';

export interface ChannelDescriptor {
  channelId: string;
  name: string;
  unit: string;
  dataType: 'scalar' | 'vec3';
}

export interface StructuredDiagnostic {
  severity: 'info' | 'warning' | 'error';
  message: string;
  affectedEntityIds: string[];
  suggestion: string;
  code: string;
}

interface SimulationState {
  state: SimState;
  simTime: number;
  stepCount: number;
  maxSimTime: number;
  loopEnabled: boolean;
  errorMessage: string | null;
  compilationDiagnostics: string[];
  structuredDiagnostics: StructuredDiagnostic[];
  channelDescriptors: ChannelDescriptor[];
  /** True when the model or settings have changed since the last successful compile. */
  needsCompile: boolean;
  setCompilationResult(
    success: boolean,
    error?: string,
    diagnostics?: string[],
    channels?: ChannelDescriptor[],
    structuredDiagnostics?: StructuredDiagnostic[],
  ): void;
  setSimState(state: SimState, time: number, stepCount: number): void;
  setLoopEnabled(enabled: boolean): void;
  setError(message: string): void;
  setNeedsCompile(v: boolean): void;
  reset(): void;
}

export const useSimulationStore = create<SimulationState>()((set) => ({
  state: 'idle',
  simTime: 0,
  stepCount: 0,
  maxSimTime: 0,
  loopEnabled: false,
  errorMessage: null,
  compilationDiagnostics: [],
  structuredDiagnostics: [],
  channelDescriptors: [],
  needsCompile: true,
  setCompilationResult: (success, error, diagnostics, channels, structuredDiagnostics) =>
    set({
      state: success ? 'paused' : 'error',
      errorMessage: success ? null : (error ?? 'Compilation failed'),
      compilationDiagnostics: diagnostics ?? [],
      structuredDiagnostics: structuredDiagnostics ?? [],
      channelDescriptors: channels ?? [],
      needsCompile: !success,
    }),
  setSimState: (state, time, stepCount) =>
    set((prev) => ({
      state,
      simTime: time,
      stepCount,
      maxSimTime: Math.max(prev.maxSimTime, time),
    })),
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setError: (message) => set({ state: 'error', errorMessage: message }),
  setNeedsCompile: (v) => set({ needsCompile: v }),
  reset: () =>
    set({
      state: 'idle',
      simTime: 0,
      stepCount: 0,
      maxSimTime: 0,
      errorMessage: null,
      compilationDiagnostics: [],
      structuredDiagnostics: [],
      channelDescriptors: [],
      needsCompile: true,
    }),
}));
