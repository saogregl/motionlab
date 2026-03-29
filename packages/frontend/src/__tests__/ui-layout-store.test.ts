import { describe, expect, it, vi } from 'vitest';

describe('UI layout store', () => {
  it('defaults the workbench workspace to build', async () => {
    vi.resetModules();
    const { useUILayoutStore } = await import('../stores/ui-layout.js');
    expect(useUILayoutStore.getState().activeWorkspace).toBe('build');
  });
});
