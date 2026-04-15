import { SimulationAction } from '@motionlab/protocol';
import { ToolbarButton, ToolbarGroup } from '@motionlab/ui';
import { Maximize2, MousePointer2, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { sendScrub, sendSimulationControl } from '../engine/connection.js';
import { useChartThemeKey } from '../hooks/useChartTheme.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { getSimTime } from '../stores/sim-clock.js';
import { useSimulationStore } from '../stores/simulation.js';
import { type StoreSample, useTraceStore } from '../stores/traces.js';
import { type AxisTheme, computeAxisLayout } from '../utils/chart-axis-assignment.js';

// ---------------------------------------------------------------------------
// Theme-aware chart colors (read from CSS custom properties)
// ---------------------------------------------------------------------------

const CHART_SERIES_TOKENS = [
  '--chart-series-1',
  '--chart-series-2',
  '--chart-series-3',
  '--chart-series-4',
  '--chart-series-5',
  '--chart-series-6',
  '--chart-series-7',
  '--chart-series-8',
  '--chart-series-9',
  '--chart-series-10',
  '--chart-series-11',
  '--chart-series-12',
  '--chart-series-13',
  '--chart-series-14',
] as const;

function readChartColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return CHART_SERIES_TOKENS.map((token) => style.getPropertyValue(token).trim() || '#888');
}

function readChartScrubColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--chart-scrub').trim() ||
    'rgba(255,255,255,0.6)'
  );
}

function readAxisTheme(): AxisTheme {
  const style = getComputedStyle(document.documentElement);
  return {
    axisText: style.getPropertyValue('--chart-axis-text').trim() || '#525252',
    grid: style.getPropertyValue('--chart-grid').trim() || '#e0e0e0',
  };
}

/** Exported for ChannelBrowser color-swatch matching. */
export { CHART_SERIES_TOKENS, readChartColors };

// ---------------------------------------------------------------------------
// uPlot data helpers
// ---------------------------------------------------------------------------

// Reusable buffers to reduce GC pressure during high-frequency updates.
let _cachedXArr: Float64Array | null = null;
const _cachedLookup = new Map<number, number>();

function buildAlignedData(
  activeIds: string[],
  traces: Map<string, StoreSample[]>,
): uPlot.AlignedData {
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

  // Reuse Float64Array when length hasn't changed
  if (!_cachedXArr || _cachedXArr.length !== times.length) {
    _cachedXArr = new Float64Array(times.length);
  }
  for (let i = 0; i < times.length; i++) _cachedXArr[i] = times[i];

  const series: (number | null)[][] = [];
  for (const id of activeIds) {
    const samples = traces.get(id) ?? [];
    _cachedLookup.clear();
    for (const s of samples) _cachedLookup.set(s.time, s.value);

    const yArr: (number | null)[] = new Array(times.length);
    for (let i = 0; i < times.length; i++) {
      yArr[i] = _cachedLookup.get(times[i]) ?? null;
    }
    series.push(yArr);
  }

  return [_cachedXArr, ...series] as unknown as uPlot.AlignedData;
}

// ---------------------------------------------------------------------------
// uPlot plugins
// ---------------------------------------------------------------------------

function scrubMarkerPlugin(getTime: () => number, scrubColor: string): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u: uPlot) => {
          const cx = u.valToPos(getTime(), 'x', true);
          if (cx < u.bbox.left || cx > u.bbox.left + u.bbox.width) return;
          const ctx = u.ctx;
          ctx.save();
          ctx.strokeStyle = scrubColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, u.bbox.top);
          ctx.lineTo(cx, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.restore();
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// buildOpts — now with multi-axis, zoom, click-to-scrub
// ---------------------------------------------------------------------------

function buildOpts(
  width: number,
  height: number,
  activeIds: string[],
  channelMap: Map<string, { name: string; unit: string }>,
  colors: string[],
  scrubColor: string,
  zoomedRef: React.RefObject<boolean>,
  axisTheme: AxisTheme,
): uPlot.Options {
  const layout = computeAxisLayout(activeIds, channelMap, axisTheme);

  const seriesOpts: uPlot.Series[] = [
    { label: 'Time (s)' },
    ...activeIds.map((id, i) => {
      const ch = channelMap.get(id);
      // In mixed-unit mode, include unit in series label for clarity
      const unitSuffix = layout.mixedUnits && ch?.unit ? ` (${ch.unit})` : '';
      return {
        label: (ch?.name ?? id) + unitSuffix,
        stroke: colors[i % colors.length],
        width: 1.5,
        scale: layout.seriesScaleMap.get(id) ?? 'y',
      } as uPlot.Series;
    }),
  ];

  return {
    width,
    height,
    scales: layout.scales,
    axes: layout.axes,
    series: seriesOpts,
    cursor: {
      drag: {
        x: true,
        y: false,
        dist: 5,
        // Fires when mouseup < dist px from mousedown (click, not drag)
        click: (_self: uPlot, e: MouseEvent) => {
          const rect = _self.over.getBoundingClientRect();
          const xPos = e.clientX - rect.left;
          const time = _self.posToVal(xPos, 'x');
          if (!Number.isFinite(time) || time < 0) return;

          // Auto-pause if running
          const { state } = useSimulationStore.getState();
          if (state === 'running') {
            sendSimulationControl(SimulationAction.PAUSE);
          }
          sendScrub(time);
        },
      },
      // Double-click resets zoom
      bind: {
        dblclick: (self: uPlot) => {
          return (_e: MouseEvent) => {
            // Reset to auto-scale by re-setting data with resetScales
            zoomedRef.current = false;
            const data = self.data;
            if (data[0].length > 0) {
              self.setData(data, true);
            }
            return null;
          };
        },
      },
    },
    hooks: {
      setScale: [
        (_u: uPlot, key: string) => {
          if (key === 'x') {
            zoomedRef.current = true;
          }
        },
      ],
    },
    legend: { show: false },
    plugins: [scrubMarkerPlugin(getSimTime, scrubColor)],
  };
}

// ---------------------------------------------------------------------------
// ChartPanel component
// ---------------------------------------------------------------------------

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const rafRef = useRef<number>(0);
  const activeIdsRef = useRef<string[]>([]);
  const chartColorsRef = useRef<string[]>(readChartColors());
  const zoomedRef = useRef(false);
  const themeKey = useChartThemeKey();

  const activeChannels = useTraceStore((s) => s.activeChannels);
  const channels = useTraceStore((s) => s.channels);

  // Convert Set to sorted array for stable identity
  const activeIds = Array.from(activeChannels).sort();
  activeIdsRef.current = activeIds;

  // Latest values for legend (low-frequency React state)
  const [latestValues, setLatestValues] = useState<Map<string, number>>(new Map());

  // Toolbar state
  const [showCursorValues, setShowCursorValues] = useState(false);

  // ----- Selection-linked channel activation -----
  const selectedIds = useSelectionStore((s) => s.selectedIds);

  useEffect(() => {
    const traceChannels = useTraceStore.getState().channels;
    if (traceChannels.size === 0) return;

    const mechState = useMechanismStore.getState();
    const newActive: string[] = [];

    for (const selId of selectedIds) {
      // If it's a joint, activate all its channels
      if (mechState.joints.has(selId)) {
        const prefix = `joint/${selId}/`;
        for (const chId of traceChannels.keys()) {
          if (chId.startsWith(prefix)) newActive.push(chId);
        }
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
            const prefix = `joint/${j.id}/`;
            for (const chId of traceChannels.keys()) {
              if (chId.startsWith(prefix)) newActive.push(chId);
            }
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

    // Reset zoom state on recreation
    zoomedRef.current = false;

    if (activeIds.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 100);
    const height = Math.max(rect.height, 60);

    const colors = readChartColors();
    chartColorsRef.current = colors;
    const scrubColor = readChartScrubColor();
    const axisTheme = readAxisTheme();
    const opts = buildOpts(
      width,
      height,
      activeIds,
      channels,
      colors,
      scrubColor,
      zoomedRef,
      axisTheme,
    );
    const data = buildAlignedData(activeIds, useTraceStore.getState().traces);

    const uplot = new uPlot(opts, data, container);
    uplotRef.current = uplot;

    // Imperative data pump — subscribe to trace store outside React
    let lastLegendUpdate = 0;
    const LEGEND_INTERVAL = 200; // update legend text at ~5fps (imperceptible above this)
    const unsubTraces = useTraceStore.subscribe((state) => {
      if (rafRef.current) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (!uplotRef.current) return;
        const aligned = buildAlignedData(activeIdsRef.current, state.traces);
        // When zoomed, preserve user's zoom range; otherwise auto-scale
        uplotRef.current.setData(aligned, !zoomedRef.current);

        // Throttle legend React re-renders to ~5fps
        const now = performance.now();
        if (now - lastLegendUpdate >= LEGEND_INTERVAL) {
          lastLegendUpdate = now;
          const vals = new Map<string, number>();
          for (const id of activeIdsRef.current) {
            const samples = state.traces.get(id);
            if (samples && samples.length > 0) {
              vals.set(id, samples[samples.length - 1].value);
            }
          }
          setLatestValues(vals);
        }
      });
    });

    // Redraw scrub marker when paused and user scrubs the timeline.
    // During live simulation the trace data pump already triggers redraws.
    const unsubScrub = useSimulationStore.subscribe((state, prev) => {
      if (state.simTime !== prev.simTime && state.state === 'paused') {
        uplotRef.current?.redraw();
      }
    });

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 100);
        const h = Math.max(entry.contentRect.height, 60);
        uplotRef.current?.setSize({ width: w, height: h });
      }
    });
    ro.observe(container);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      unsubTraces();
      unsubScrub();
      ro.disconnect();
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }
    };
    // Recreate when active channel set changes or theme switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, channels, themeKey]);

  const handleToggle = useCallback((id: string) => {
    useTraceStore.getState().toggleChannel(id);
  }, []);

  // ----- Toolbar handlers -----
  const handleResetZoom = useCallback(() => {
    zoomedRef.current = false;
    const u = uplotRef.current;
    if (u && u.data[0].length > 0) {
      u.setData(u.data, true);
    }
  }, []);

  const handleAutoScaleY = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;
    // Force Y scales to re-fit by re-setting data
    u.setData(u.data, true);
  }, []);

  const layout = computeAxisLayout(activeIds, channels);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      {activeIds.length > 0 && (
        <div className="flex h-7 shrink-0 items-center border-b border-[var(--border-subtle)] ps-1 pe-2">
          <ToolbarGroup separator>
            <ToolbarButton
              tooltip="Reset Zoom"
              shortcut="Dbl-click"
              onClick={handleResetZoom}
              disabled={!zoomedRef.current}
            >
              <ZoomOut className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton tooltip="Auto-scale Y" onClick={handleAutoScaleY}>
              <Maximize2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              tooltip="Cursor Values"
              active={showCursorValues}
              onClick={() => setShowCursorValues((v) => !v)}
            >
              <MousePointer2 className="size-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
          <span className="ms-auto text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            {activeIds.length} channel{activeIds.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Chart area */}
      <div ref={containerRef} className="min-h-0 flex-1" />

      {/* Legend */}
      {activeIds.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] ps-2 pe-2 py-1">
          {activeIds.map((id, i) => {
            const ch = channels.get(id);
            const latest = latestValues.get(id);
            const colors = chartColorsRef.current;
            const unitSuffix = layout.mixedUnits && ch?.unit ? ` (${ch.unit})` : '';
            return (
              <button
                key={id}
                type="button"
                className="flex items-center gap-1 rounded ps-1.5 pe-1.5 py-0.5 text-xs hover:bg-[var(--layer-raised)]"
                onClick={() => handleToggle(id)}
              >
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-[var(--text-primary)]">
                  {ch?.name ?? id}
                  {unitSuffix}
                </span>
                {showCursorValues && latest !== undefined && (
                  <span className="text-[var(--text-tertiary)]">{latest.toFixed(4)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {activeIds.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-[var(--text-disabled)]">
          Select a joint or use the channel browser
        </div>
      )}
    </div>
  );
}
