import { beforeEach, describe, expect, it } from 'vitest';

import { useLoadCreationStore } from '../stores/load-creation.js';

describe('Load creation store', () => {
  beforeEach(() => {
    useLoadCreationStore.getState().exitMode();
  });

  it('starts idle with no selected datums', () => {
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('idle');
    expect(state.datumId).toBeNull();
    expect(state.secondDatumId).toBeNull();
    expect(state.preselectedLoadType).toBeNull();
    expect(state.creatingDatum).toBe(false);
  });

  it('startCreation transitions to pick-datum and clears transient state', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('spring-damper');
    store.startCreation();
    store.setDatum('datum-a');
    store.setSecondDatum('datum-b');
    store.setCreatingDatum(true);

    useLoadCreationStore.getState().startCreation();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-datum');
    expect(state.datumId).toBeNull();
    expect(state.secondDatumId).toBeNull();
    expect(state.creatingDatum).toBe(false);
  });

  it('setDatum enters pick-second-datum for spring-damper creation', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('spring-damper');
    store.startCreation();
    store.setDatum('datum-a');

    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-second-datum');
    expect(state.datumId).toBe('datum-a');
    expect(state.secondDatumId).toBeNull();
  });

  it('setDatum enters configure for point loads', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('point-force');
    store.startCreation();
    store.setDatum('datum-a');

    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('configure');
    expect(state.datumId).toBe('datum-a');
  });

  it('beginSecondDatumPick returns to target-picking and clears second datum', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('spring-damper');
    store.startCreation();
    store.setDatum('datum-a');
    store.setSecondDatum('datum-b');

    useLoadCreationStore.getState().beginSecondDatumPick();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-second-datum');
    expect(state.datumId).toBe('datum-a');
    expect(state.secondDatumId).toBeNull();
  });

  it('cancel from configure with a spring target returns to pick-second-datum', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('spring-damper');
    store.startCreation();
    store.setDatum('datum-a');
    store.setSecondDatum('datum-b');

    useLoadCreationStore.getState().cancel();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-second-datum');
    expect(state.datumId).toBe('datum-a');
    expect(state.secondDatumId).toBeNull();
  });

  it('cancel from configure for point loads returns to pick-datum', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('point-force');
    store.startCreation();
    store.setDatum('datum-a');

    useLoadCreationStore.getState().cancel();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-datum');
    expect(state.datumId).toBeNull();
    expect(state.secondDatumId).toBeNull();
  });

  it('reset prepares the store for rapid authoring and clears preselection', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('point-torque');
    store.startCreation();
    store.setDatum('datum-a');
    store.setCreatingDatum(true);

    useLoadCreationStore.getState().reset();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('pick-datum');
    expect(state.datumId).toBeNull();
    expect(state.secondDatumId).toBeNull();
    expect(state.preselectedLoadType).toBeNull();
    expect(state.creatingDatum).toBe(false);
  });

  it('exitMode returns to idle and clears all fields', () => {
    const store = useLoadCreationStore.getState();
    store.setPreselectedLoadType('point-force');
    store.startCreation();
    store.setDatum('datum-a');
    store.setCreatingDatum(true);

    useLoadCreationStore.getState().exitMode();
    const state = useLoadCreationStore.getState();
    expect(state.step).toBe('idle');
    expect(state.datumId).toBeNull();
    expect(state.secondDatumId).toBeNull();
    expect(state.preselectedLoadType).toBeNull();
    expect(state.creatingDatum).toBe(false);
  });
});
