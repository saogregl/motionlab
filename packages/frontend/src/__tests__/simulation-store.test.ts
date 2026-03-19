import { beforeEach, describe, expect, it } from 'vitest';

import { useSimulationStore } from '../stores/simulation.js';

describe('Simulation store', () => {
  beforeEach(() => {
    useSimulationStore.getState().reset();
  });

  it('initial state', () => {
    const s = useSimulationStore.getState();
    expect(s.state).toBe('idle');
    expect(s.simTime).toBe(0);
    expect(s.stepCount).toBe(0);
    expect(s.errorMessage).toBeNull();
    expect(s.compilationDiagnostics).toEqual([]);
  });

  it('setCompilationResult(true) transitions to paused', () => {
    useSimulationStore
      .getState()
      .setCompilationResult(true, undefined, ['2 bodies'], [
        { channelId: 'ch1', name: 'Ch1', unit: 'rad', dataType: 'scalar' },
      ]);
    const s = useSimulationStore.getState();
    expect(s.state).toBe('paused');
    expect(s.errorMessage).toBeNull();
    expect(s.compilationDiagnostics).toEqual(['2 bodies']);
    expect(s.channelDescriptors).toHaveLength(1);
  });

  it('setCompilationResult(false, msg) transitions to error', () => {
    useSimulationStore
      .getState()
      .setCompilationResult(false, 'No bodies');
    const s = useSimulationStore.getState();
    expect(s.state).toBe('error');
    expect(s.errorMessage).toBe('No bodies');
  });

  it('setCompilationResult(false) without message uses default', () => {
    useSimulationStore.getState().setCompilationResult(false);
    expect(useSimulationStore.getState().errorMessage).toBe(
      'Compilation failed',
    );
  });

  it('setSimState updates all three fields', () => {
    useSimulationStore.getState().setSimState('running', 1.5, 150);
    const s = useSimulationStore.getState();
    expect(s.state).toBe('running');
    expect(s.simTime).toBe(1.5);
    expect(s.stepCount).toBe(150);
  });

  it('setError transitions to error state', () => {
    useSimulationStore.getState().setError('Something broke');
    const s = useSimulationStore.getState();
    expect(s.state).toBe('error');
    expect(s.errorMessage).toBe('Something broke');
  });

  it('reset returns to initial state', () => {
    useSimulationStore.getState().setSimState('running', 5, 500);
    useSimulationStore.getState().reset();
    const s = useSimulationStore.getState();
    expect(s.state).toBe('idle');
    expect(s.simTime).toBe(0);
    expect(s.stepCount).toBe(0);
    expect(s.errorMessage).toBeNull();
    expect(s.compilationDiagnostics).toEqual([]);
    expect(s.channelDescriptors).toEqual([]);
  });

  it('full lifecycle: idle → paused → running → paused → idle', () => {
    const store = useSimulationStore;

    expect(store.getState().state).toBe('idle');

    store.getState().setCompilationResult(true);
    expect(store.getState().state).toBe('paused');

    store.getState().setSimState('running', 0.1, 10);
    expect(store.getState().state).toBe('running');

    store.getState().setSimState('paused', 0.5, 50);
    expect(store.getState().state).toBe('paused');

    store.getState().reset();
    expect(store.getState().state).toBe('idle');
  });
});
