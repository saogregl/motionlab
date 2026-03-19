import { useCallback, useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTraceStore, type StoreSample } from '../stores/traces.js';
import { useSelectionStore } from '../stores/selection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function buildAlignedData(
  activeIds: string[],
  traces: Map<string, StoreSample[]>,
): uPlot.AlignedData {
  // Merge all timestamps
  const timeSet = new Set<number>();
  for (const id of activeIds) {
    const samples = traces.get(id);
    if (samples) {
      for (const s of samples) timeSet.add(s.time);
    }
  }

  const times = Array.from(timeSet).sort((a, b) => a - b);
  if (times.length === 0) {
    return [new Float64Array(0)] as unknown as uPlot.AlignedData;
  }

  const xArr = new Float64Array(times.length);
  for (let i = 0; i < times.length; i++) xArr[i] = times[i];

  const series: (number | null)[][] = [];
  for (const id of activeIds) {
    const samples = traces.get(id) ?? [];
    // Build a time→value lookup for this channel
    const lookup = new Map<number, number>();
    for (const s of samples) lookup.set(s.time, s.value);

    const yArr: (number | null)[] = new Array(times.length);
    for (let i = 0; i < times.length; i++) {
      yArr[i] = lookup.get(times[i]) ?? null;
    }
    series.push(yArr);
  }

  return [xArr, ...series] as unknown as uPlot.AlignedData;
}

function scrubMarkerPlugin(getTime: () => number): uPlot.Plugin {
  return {
    hooks: {
      draw: [(u: uPlot) => {
        const cx = u.valToPos(getTime(), 'x', true);
        if (cx < u.bbox.left || cx > u.bbox.left + u.bbox.width) return;
        const ctx = u.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, u.bbox.top);
        ctx.lineTo(cx, u.bbox.top + u.bbox.height);
        ctx.stroke();
        ctx.restore();
      }],
    },
  };
}

function buildOpts(
  width: number,
  height: number,
  activeIds: string[],
  channelMap: Map<string, { name: string; unit: string }>,
): uPlot.Options {
  const seriesOpts: uPlot.Series[] = [
    { label: 'Time (s)' },
    ...activeIds.map((id, i) => {
      const ch = channelMap.get(id);
      return {
        label: ch?.name ?? id,
        stroke: COLORS[i % COLORS.length],
        width: 1.5,
      } as uPlot.Series;
    }),
  ];

  return {
    width,
    height,
    scales: { x: { time: false } },
    axes: [
      { label: 'Time (s)' },
      { label: 'Value' },
    ],
    series: seriesOpts,
    cursor: { drag: { x: false, y: false } },
    plugins: [scrubMarkerPlugin(() => useSimulationStore.getState().simTime)],
  };
}

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const rafRef = useRef<number>(0);
  const activeIdsRef = useRef<string[]>([]);

  const activeChannels = useTraceStore((s) => s.activeChannels);
  const channels = useTraceStore((s) => s.channels);

  // Convert Set to sorted array for stable identity
  const activeIds = Array.from(activeChannels).sort();
  activeIdsRef.current = activeIds;

  // Latest values for legend (low-frequency React state)
  const [latestValues, setLatestValues] = useState<Map<string, number>>(new Map());

  // ----- Selection-linked channel activation -----
  const selectedIds = useSelectionStore((s) => s.selectedIds);

  useEffect(() => {
    const traceChannels = useTraceStore.getState().channels;
    if (traceChannels.size === 0) return;

    const mechState = useMechanismStore.getState();
    const newActive: string[] = [];

    for (const selId of selectedIds) {
      // If it's a joint, activate its channels directly
      if (mechState.joints.has(selId)) {
        const posId = `joint/${selId}/position`;
        const velId = `joint/${selId}/velocity`;
        if (traceChannels.has(posId)) newActive.push(posId);
        if (traceChannels.has(velId)) newActive.push(velId);
        continue;
      }

      // If it's a body, find joints connected through datums on that body
      if (mechState.bodies.has(selId)) {
        const bodyDatumIds = new Set<string>();
        for (const d of mechState.datums.values()) {
          if (d.parentBodyId === selId) bodyDatumIds.add(d.id);
        }
        for (const j of mechState.joints.values()) {
          if (bodyDatumIds.has(j.parentDatumId) || bodyDatumIds.has(j.childDatumId)) {
            const posId = `joint/${j.id}/position`;
            const velId = `joint/${j.id}/velocity`;
            if (traceChannels.has(posId)) newActive.push(posId);
            if (traceChannels.has(velId)) newActive.push(velId);
          }
        }
      }
    }

    if (newActive.length > 0) {
      useTraceStore.getState().setActiveChannels(newActive);
    }
  }, [selectedIds]);

  // ----- Create/recreate uPlot when active channels change -----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Destroy previous instance
    if (uplotRef.current) {
      uplotRef.current.destroy();
      uplotRef.current = null;
    }

    if (activeIds.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 100);
    const height = Math.max(rect.height - 40, 60); // leave room for legend

    const opts = buildOpts(width, height, activeIds, channels);
    const data = buildAlignedData(activeIds, useTraceStore.getState().traces);

    const uplot = new uPlot(opts, data, container);
    uplotRef.current = uplot;

    // Imperative data pump — subscribe to trace store outside React
    const unsub = useTraceStore.subscribe((state) => {
      if (rafRef.current) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (!uplotRef.current) return;
        const aligned = buildAlignedData(activeIdsRef.current, state.traces);
        uplotRef.current.setData(aligned);

        // Update latest values for legend (throttled by RAF)
        const vals = new Map<string, number>();
        for (const id of activeIdsRef.current) {
          const samples = state.traces.get(id);
          if (samples && samples.length > 0) {
            vals.set(id, samples[samples.length - 1].value);
          }
        }
        setLatestValues(vals);
      });
    });

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 100);
        const h = Math.max(entry.contentRect.height - 40, 60);
        uplotRef.current?.setSize({ width: w, height: h });
      }
    });
    ro.observe(container);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      unsub();
      ro.disconnect();
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }
    };
    // Recreate when active channel set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(',')]);

  // Redraw chart on simTime changes (scrub marker) when no new data arrives
  const simTime = useSimulationStore((s) => s.simTime);
  useEffect(() => {
    uplotRef.current?.redraw();
  }, [simTime]);

  const handleToggle = useCallback((id: string) => {
    useTraceStore.getState().toggleChannel(id);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="min-h-0 flex-1" />
      {activeIds.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-700 px-2 py-1">
          {activeIds.map((id, i) => {
            const ch = channels.get(id);
            const latest = latestValues.get(id);
            return (
              <button
                key={id}
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-neutral-700"
                onClick={() => handleToggle(id)}
              >
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-neutral-200">
                  {ch?.name ?? id}
                  {ch?.unit ? ` (${ch.unit})` : ''}
                </span>
                {latest !== undefined && (
                  <span className="text-neutral-400">
                    {latest.toFixed(4)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {activeIds.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          Select a joint to see its output channels
        </div>
      )}
    </div>
  );
}
