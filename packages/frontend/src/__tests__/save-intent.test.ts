import { describe, expect, it } from 'vitest';

import { SaveIntentTracker } from '../engine/save-intent.js';

describe('SaveIntentTracker', () => {
  it('keeps autosave silent even if duplicate autosave requests arrive', () => {
    const tracker = new SaveIntentTracker();

    expect(tracker.requestAutoSave()).toBe(true);
    expect(tracker.requestAutoSave()).toBe(false);
    expect(tracker.consumeProjectData(null)).toEqual({ kind: 'autosave' });
    expect(tracker.consumeProjectData(null)).toEqual({ kind: 'manual', existingPath: null });
  });

  it('preserves pending autosave routing when a manual save is requested afterward', () => {
    const tracker = new SaveIntentTracker();

    expect(tracker.requestAutoSave()).toBe(true);
    tracker.requestManualSave();

    expect(tracker.consumeProjectData('/tmp/demo.motionlab')).toEqual({ kind: 'autosave' });
    expect(tracker.consumeProjectData('/tmp/demo.motionlab')).toEqual({
      kind: 'manual',
      existingPath: '/tmp/demo.motionlab',
    });
  });

  it('forces save-as only for the next manual save result', () => {
    const tracker = new SaveIntentTracker();

    tracker.requestSaveAs();

    expect(tracker.consumeProjectData('/tmp/demo.motionlab')).toEqual({
      kind: 'manual',
      existingPath: null,
    });
    expect(tracker.consumeProjectData('/tmp/demo.motionlab')).toEqual({
      kind: 'manual',
      existingPath: '/tmp/demo.motionlab',
    });
  });

  it('clears pending autosave state when an autosave save result errors', () => {
    const tracker = new SaveIntentTracker();

    expect(tracker.requestAutoSave()).toBe(true);
    expect(tracker.consumeError()).toBe('autosave');
    expect(tracker.requestAutoSave()).toBe(true);
  });
});
