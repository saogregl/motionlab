import { createSaveProjectCommand } from '@motionlab/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@motionlab/protocol', async () => {
  const actual = await vi.importActual<typeof import('@motionlab/protocol')>('@motionlab/protocol');
  return {
    ...actual,
    eventToDebugJson: (event: unknown) =>
      JSON.stringify(event, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
  };
});

describe('DebugRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks outbound commands by sequence id and clears them on matching responses', async () => {
    const { DebugRecorder } = await import('../debug/recorder.js');
    const appended: Array<{ direction: string; sequenceId: string }> = [];
    const recorder = new DebugRecorder({
      appendProtocolEntry: (entry) =>
        appended.push({
          direction: entry.direction,
          sequenceId: entry.sequenceId,
        }),
    });
    recorder.setEnabled(true);

    recorder.recordOutboundCommand(createSaveProjectCommand('Demo', 42n));
    expect(recorder.getPendingCommands()).toEqual([
      expect.objectContaining({
        sequenceId: '42',
        messageType: 'saveProject',
        timedOut: false,
      }),
    ]);

    recorder.recordInboundEvent(
      {
        sequenceId: 42n,
        payload: {
          case: 'handshakeAck',
        },
      } as never,
      128,
    );

    expect(recorder.getPendingCommands()).toEqual([]);
    expect(appended).toEqual([
      { direction: 'outbound', sequenceId: '42' },
      { direction: 'inbound', sequenceId: '42' },
    ]);
  });

  it('records command timeouts as anomalies', async () => {
    const { DebugRecorder } = await import('../debug/recorder.js');
    const recorder = new DebugRecorder();
    recorder.setEnabled(true);

    recorder.recordOutboundCommand(createSaveProjectCommand('Timeout', 7n));
    vi.advanceTimersByTime(15_001);

    expect(recorder.getAnomalies()).toContainEqual(
      expect.objectContaining({
        code: 'command-timeout',
        severity: 'error',
      }),
    );
  });

  it('keeps streaming traffic in a separate rolling buffer', async () => {
    const { DebugRecorder } = await import('../debug/recorder.js');
    const recorder = new DebugRecorder();
    recorder.setEnabled(true);

    recorder.recordInboundEvent(
      {
        sequenceId: 99n,
        payload: {
          case: 'simulationFrame',
        },
      } as never,
      96,
    );

    expect(recorder.getRecentEntries()).toHaveLength(0);
    expect(recorder.getRecentStreamEntries()).toHaveLength(1);
    expect(recorder.getRecentStreamEntries()[0]).toEqual(
      expect.objectContaining({
        messageType: 'simulationFrame',
        streaming: true,
      }),
    );
  });

  it('does not record traffic when disabled', async () => {
    const { DebugRecorder } = await import('../debug/recorder.js');
    const recorder = new DebugRecorder();

    recorder.recordOutboundCommand(createSaveProjectCommand('Demo', 42n));
    recorder.recordInboundEvent(
      {
        sequenceId: 42n,
        payload: {
          case: 'simulationFrame',
        },
      } as never,
      96,
    );

    expect(recorder.getPendingCommands()).toEqual([]);
    expect(recorder.getRecentEntries()).toEqual([]);
    expect(recorder.getRecentStreamEntries()).toEqual([]);
    expect(recorder.getAnomalies()).toEqual([]);
  });
});
