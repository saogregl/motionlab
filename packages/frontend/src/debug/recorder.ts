import {
  commandToDebugJson,
  eventToDebugJson,
  parseCommand,
} from '@motionlab/protocol';
import type { Event } from '@motionlab/protocol';
import type {
  DebugAnomaly,
  DebugCaptureLimits,
  DebugConsoleEntry,
  DebugEvent,
  DebugPendingCommand,
  DebugProtocolEntry,
} from './types.js';

export interface DebugRecorderHost {
  appendProtocolEntry?(entry: DebugProtocolEntry): void;
  appendConsoleEntry?(entry: DebugConsoleEntry): void;
  appendAnomaly?(anomaly: DebugAnomaly): void;
}

const DEFAULT_LIMITS: DebugCaptureLimits = {
  maxRecentProtocolEntries: 500,
  maxRecentStreamEntries: 240,
  maxRecentConsoleEntries: 200,
  maxRecentAnomalies: 100,
  maxPendingCommands: 200,
  commandTimeoutMs: 15_000,
  maxStreamWindowSeconds: 10,
};

interface PendingCommandRecord {
  sequenceId: string;
  messageType: string;
  sentAt: string;
  sentMonotonicMs: number;
  timeoutId: ReturnType<typeof setTimeout>;
  timedOut: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendBounded<T>(target: T[], item: T, limit: number): void {
  target.push(item);
  if (target.length > limit) {
    target.splice(0, target.length - limit);
  }
}

function safeSerializeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeSerializeValue(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = safeSerializeValue(nested, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
}

export class DebugRecorder {
  private readonly limits: DebugCaptureLimits;
  private readonly host: DebugRecorderHost;
  private readonly recentEntries: DebugProtocolEntry[] = [];
  private readonly recentStreamEntries: DebugProtocolEntry[] = [];
  private readonly consoleEntries: DebugConsoleEntry[] = [];
  private readonly anomalies: DebugAnomaly[] = [];
  private readonly pendingCommands = new Map<string, PendingCommandRecord>();
  private readonly listeners = new Set<(event: DebugEvent) => void>();

  constructor(host: DebugRecorderHost = {}, limits: Partial<DebugCaptureLimits> = {}) {
    this.host = host;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  getCaptureLimits(): DebugCaptureLimits {
    return { ...this.limits };
  }

  onEvent(listener: (event: DebugEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: DebugEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Keep the recorder side-effect safe.
      }
    }
  }

  private recordEntry(entry: DebugProtocolEntry): void {
    const target = entry.streaming ? this.recentStreamEntries : this.recentEntries;
    const limit = entry.streaming
      ? this.limits.maxRecentStreamEntries
      : this.limits.maxRecentProtocolEntries;
    appendBounded(target, entry, limit);
    if (!entry.streaming) {
      this.host.appendProtocolEntry?.(entry);
    }
  }

  recordOutboundCommand(bytes: Uint8Array): string {
    const command = parseCommand(bytes);
    const sequenceId = command.sequenceId.toString();
    const entry: DebugProtocolEntry = {
      timestamp: nowIso(),
      monotonicMs: performance.now(),
      direction: 'outbound',
      sequenceId,
      messageType: command.payload.case ?? 'unknown',
      payloadJson: commandToDebugJson(command),
      sizeBytes: bytes.byteLength,
      streaming: false,
    };
    this.recordEntry(entry);

    const timeoutId = globalThis.setTimeout(() => {
      const pending = this.pendingCommands.get(sequenceId);
      if (!pending || pending.timedOut) return;
      pending.timedOut = true;
      this.recordAnomaly({
        severity: 'error',
        code: 'command-timeout',
        message: `Command ${pending.messageType} timed out`,
        details: {
          sequenceId,
          messageType: pending.messageType,
          timeoutMs: this.limits.commandTimeoutMs,
        },
      });
    }, this.limits.commandTimeoutMs);

    this.pendingCommands.set(sequenceId, {
      sequenceId,
      messageType: entry.messageType,
      sentAt: entry.timestamp,
      sentMonotonicMs: entry.monotonicMs,
      timeoutId,
      timedOut: false,
    });
    if (this.pendingCommands.size > this.limits.maxPendingCommands) {
      const oldest = this.pendingCommands.keys().next().value;
      if (oldest) {
        const stale = this.pendingCommands.get(oldest);
        if (stale) globalThis.clearTimeout(stale.timeoutId);
        this.pendingCommands.delete(oldest);
      }
    }
    return sequenceId;
  }

  recordInboundEvent(event: Event, sizeBytes: number): void {
    const messageType = event.payload.case ?? 'unknown';
    const streaming = messageType === 'simulationFrame' || messageType === 'simulationTrace';
    const entry: DebugProtocolEntry = {
      timestamp: nowIso(),
      monotonicMs: performance.now(),
      direction: 'inbound',
      sequenceId: event.sequenceId.toString(),
      messageType,
      payloadJson: eventToDebugJson(event),
      sizeBytes,
      streaming,
    };
    this.recordEntry(entry);

    const pending = this.pendingCommands.get(entry.sequenceId);
    if (pending) {
      globalThis.clearTimeout(pending.timeoutId);
      this.pendingCommands.delete(entry.sequenceId);
    }
  }

  recordConsole(level: DebugConsoleEntry['level'], args: unknown[]): void {
    const entry: DebugConsoleEntry = {
      timestamp: nowIso(),
      level,
      args: args.map((arg) => safeSerializeValue(arg)),
    };
    appendBounded(this.consoleEntries, entry, this.limits.maxRecentConsoleEntries);
    this.host.appendConsoleEntry?.(entry);
  }

  recordParseFailure(source: 'command' | 'event', error: unknown, sizeBytes: number): void {
    this.recordAnomaly({
      severity: 'error',
      code: `protocol-${source}-parse-failure`,
      message: `Failed to parse ${source}`,
      details: {
        error: safeSerializeValue(error),
        sizeBytes,
      },
    });
  }

  recordAnomaly(input: Omit<DebugAnomaly, 'timestamp'>): DebugAnomaly {
    const anomaly: DebugAnomaly = {
      timestamp: nowIso(),
      ...input,
    };
    appendBounded(this.anomalies, anomaly, this.limits.maxRecentAnomalies);
    this.host.appendAnomaly?.(anomaly);
    this.emit({ type: 'anomaly', anomaly });
    return anomaly;
  }

  markConnectionClosed(reason: string): void {
    const pending = [...this.pendingCommands.values()];
    for (const command of pending) {
      globalThis.clearTimeout(command.timeoutId);
      this.pendingCommands.delete(command.sequenceId);
    }
    if (pending.length > 0) {
      this.recordAnomaly({
        severity: 'warning',
        code: 'connection-closed-with-pending-commands',
        message: 'Connection closed while commands were still pending',
        details: {
          reason,
          pending: pending.map((command) => ({
            sequenceId: command.sequenceId,
            messageType: command.messageType,
          })),
        },
      });
    }
  }

  getRecentEntries(): DebugProtocolEntry[] {
    return [...this.recentEntries];
  }

  getRecentStreamEntries(): DebugProtocolEntry[] {
    return [...this.recentStreamEntries];
  }

  getConsoleEntries(): DebugConsoleEntry[] {
    return [...this.consoleEntries];
  }

  getAnomalies(): DebugAnomaly[] {
    return [...this.anomalies];
  }

  getPendingCommands(): DebugPendingCommand[] {
    const now = performance.now();
    return [...this.pendingCommands.values()].map((pending) => ({
      sequenceId: pending.sequenceId,
      messageType: pending.messageType,
      sentAt: pending.sentAt,
      ageMs: Math.round(now - pending.sentMonotonicMs),
      timedOut: pending.timedOut,
    }));
  }
}
