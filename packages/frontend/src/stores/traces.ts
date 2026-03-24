import { create } from 'zustand';
import type { ChannelDescriptor } from './simulation.js';

export interface StoreSample {
  time: number;
  value: number;
  vec?: { x: number; y: number; z: number };
}

const MAX_TRACE_SECONDS = 60;

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
      let merged = existing.concat(samples);

      // Deduplicate by time (last-write-wins) to guard against any overlap from
      // the backend sending a repeated window, then re-sort.
      if (samples.length > 0) {
        const seen = new Map<number, StoreSample>();
        for (const s of merged) seen.set(s.time, s);
        merged = Array.from(seen.values()).sort((a, b) => a.time - b.time);
      }

      if (merged.length > 0) {
        const maxTime = merged[merged.length - 1].time;
        const cutoff = maxTime - MAX_TRACE_SECONDS;
        const idx = merged.findIndex((s) => s.time >= cutoff);
        if (idx > 0) {
          merged = merged.slice(idx);
        }
      }

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
