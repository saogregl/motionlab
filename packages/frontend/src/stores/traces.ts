import { create } from 'zustand';
import type { ChannelDescriptor } from './simulation.js';

export interface StoreSample {
  time: number;
  value: number;
  vec?: { x: number; y: number; z: number };
}

const MAX_TRACE_SECONDS = 60;

// ---------------------------------------------------------------------------
// Merge helper: combines existing + new samples for a single channel.
// Uses a fast-path append when timestamps are monotonically increasing
// (the normal case during live simulation) and falls back to full
// deduplication when timestamps overlap (scrub / replay).
// ---------------------------------------------------------------------------

function mergeSamples(existing: StoreSample[], incoming: StoreSample[]): StoreSample[] {
  if (incoming.length === 0) return existing;

  const lastExistingTime = existing.length > 0 ? existing[existing.length - 1].time : -Infinity;
  const firstIncomingTime = incoming[0].time;

  let merged: StoreSample[];

  if (firstIncomingTime > lastExistingTime) {
    // Fast path: pure append (live sim hot path — no dedup, no sort needed)
    merged = existing.concat(incoming);
  } else {
    // Overlap detected (scrub / replay): full dedup via last-write-wins
    merged = existing.concat(incoming);
    const seen = new Map<number, StoreSample>();
    for (const s of merged) seen.set(s.time, s);
    merged = Array.from(seen.values()).sort((a, b) => a.time - b.time);
  }

  // Trim to rolling window using binary search
  if (merged.length > 0) {
    const maxTime = merged[merged.length - 1].time;
    const cutoff = maxTime - MAX_TRACE_SECONDS;
    let lo = 0;
    let hi = merged.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (merged[mid].time < cutoff) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) merged = merged.slice(lo);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Batched trace ingestion — coalesces per-channel updates from a single
// engine batch into one Zustand set() call via queueMicrotask.
// ---------------------------------------------------------------------------

let pendingBatch: Map<string, StoreSample[]> = new Map();
let flushScheduled = false;

function flushPendingTraces() {
  flushScheduled = false;
  const batch = pendingBatch;
  pendingBatch = new Map();
  if (batch.size === 0) return;

  useTraceStore.setState((state) => {
    const next = new Map(state.traces);
    for (const [channelId, incoming] of batch) {
      const existing = next.get(channelId) ?? [];
      next.set(channelId, mergeSamples(existing, incoming));
    }
    return { traces: next };
  });
}

/** Queue trace samples for batched flush. Call from the WebSocket handler. */
export function addSamplesBatched(channelId: string, samples: StoreSample[]): void {
  const existing = pendingBatch.get(channelId);
  pendingBatch.set(channelId, existing ? existing.concat(samples) : samples);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushPendingTraces);
  }
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface TraceState {
  channels: Map<string, ChannelDescriptor>;
  traces: Map<string, StoreSample[]>;
  activeChannels: Set<string>;

  setChannels: (descriptors: ChannelDescriptor[]) => void;
  addSamples: (channelId: string, samples: StoreSample[]) => void;
  setActiveChannels: (ids: string[]) => void;
  toggleChannel: (id: string) => void;
  clear: () => void;
}

export const useTraceStore = create<TraceState>()((set) => ({
  channels: new Map(),
  traces: new Map(),
  activeChannels: new Set(),

  setChannels: (descriptors) => {
    const channels = new Map<string, ChannelDescriptor>();
    for (const d of descriptors) {
      channels.set(d.channelId, d);
    }
    set({
      channels,
      traces: new Map(),
      activeChannels: new Set(),
    });
  },

  addSamples: (channelId, samples) =>
    set((state) => {
      const existing = state.traces.get(channelId) ?? [];
      const merged = mergeSamples(existing, samples);
      const next = new Map(state.traces);
      next.set(channelId, merged);
      return { traces: next };
    }),

  setActiveChannels: (ids) => set({ activeChannels: new Set(ids) }),

  toggleChannel: (id) =>
    set((state) => {
      const next = new Set(state.activeChannels);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { activeChannels: next };
    }),

  clear: () =>
    set({
      channels: new Map(),
      traces: new Map(),
      activeChannels: new Set(),
    }),
}));
