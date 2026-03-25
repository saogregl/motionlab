import { Input, ScrollArea } from '@motionlab/ui';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import {
  type BrowserNode,
  buildChannelGroups,
  collectEntityNames,
} from '../utils/channel-grouping.js';
import { useChartThemeKey } from '../hooks/useChartTheme.js';
import { readChartColors } from './ChartPanel.js';

interface ChannelBrowserProps {
  className?: string;
}

export function ChannelBrowser({ className }: ChannelBrowserProps) {
  const channelDescriptors = useSimulationStore((s) => s.channelDescriptors);
  const activeChannels = useTraceStore((s) => s.activeChannels);
  const toggleChannel = useTraceStore((s) => s.toggleChannel);
  const setActiveChannels = useTraceStore((s) => s.setActiveChannels);

  const joints = useMechanismStore((s) => s.joints);
  const loads = useMechanismStore((s) => s.loads);
  const actuators = useMechanismStore((s) => s.actuators);

  const [filter, setFilter] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(['joint', 'load', 'actuator']),
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(() => new Set());

  const entityNames = useMemo(
    () => collectEntityNames(joints, loads, actuators),
    [joints, loads, actuators],
  );

  const nodes = useMemo(
    () =>
      buildChannelGroups(
        channelDescriptors,
        entityNames,
        filter,
        expandedCategories,
        expandedEntities,
      ),
    [channelDescriptors, entityNames, filter, expandedCategories, expandedEntities],
  );

  // Stable color index for every channel (based on full descriptor list, not just active)
  const allChannelIds = useMemo(
    () => channelDescriptors.map((d) => d.channelId).sort(),
    [channelDescriptors],
  );
  const colorIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < allChannelIds.length; i++) {
      map.set(allChannelIds[i], i);
    }
    return map;
  }, [allChannelIds]);

  const themeKey = useChartThemeKey();
  const chartColors = useMemo(() => readChartColors(), [themeKey]);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleEntity = useCallback((key: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleGroupToggle = useCallback(
    (channelIds: string[], allActive: boolean) => {
      const current = useTraceStore.getState().activeChannels;
      const next = new Set(current);
      if (allActive) {
        // Deselect all in group
        for (const id of channelIds) next.delete(id);
      } else {
        // Select all in group
        for (const id of channelIds) next.add(id);
      }
      setActiveChannels([...next]);
    },
    [setActiveChannels],
  );

  return (
    <div className={`flex h-full flex-col ${className ?? ''}`}>
      {/* Search filter */}
      <div className="shrink-0 border-b border-[var(--border-subtle)] p-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter channels..."
            className="h-6 ps-7 pe-2 text-xs"
          />
        </div>
      </div>

      {/* Channel tree */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-0.5">
          {nodes.map((node) => (
            <NodeRow
              key={nodeKey(node)}
              node={node}
              activeChannels={activeChannels}
              colorIndexMap={colorIndexMap}
              chartColors={chartColors}
              expandedCategories={expandedCategories}
              expandedEntities={expandedEntities}
              onToggleCategory={toggleCategory}
              onToggleEntity={toggleEntity}
              onToggleChannel={toggleChannel}
              onGroupToggle={handleGroupToggle}
            />
          ))}
          {nodes.length === 0 && (
            <div className="p-3 text-center text-xs text-[var(--text-disabled)]">
              {filter ? 'No matching channels' : 'No channels available'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function nodeKey(node: BrowserNode): string {
  switch (node.type) {
    case 'category':
      return `cat:${node.key}`;
    case 'entity':
      return `ent:${node.key}`;
    case 'channel':
      return `ch:${node.channelId}`;
  }
}

// ---------------------------------------------------------------------------
// Row renderers
// ---------------------------------------------------------------------------

interface NodeRowProps {
  node: BrowserNode;
  activeChannels: Set<string>;
  colorIndexMap: Map<string, number>;
  chartColors: string[];
  expandedCategories: Set<string>;
  expandedEntities: Set<string>;
  onToggleCategory: (key: string) => void;
  onToggleEntity: (key: string) => void;
  onToggleChannel: (id: string) => void;
  onGroupToggle: (channelIds: string[], allActive: boolean) => void;
}

function NodeRow({
  node,
  activeChannels,
  colorIndexMap,
  chartColors,
  expandedCategories,
  expandedEntities,
  onToggleCategory,
  onToggleEntity,
  onToggleChannel,
  onGroupToggle,
}: NodeRowProps) {
  if (node.type === 'category') {
    const expanded = expandedCategories.has(node.key);
    const allActive =
      node.channelIds.length > 0 && node.channelIds.every((id) => activeChannels.has(id));
    const someActive = node.channelIds.some((id) => activeChannels.has(id));

    return (
      <div className="select-none">
        <button
          type="button"
          className="flex w-full items-center gap-1 ps-1 pe-1.5 py-0.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--layer-raised)]"
          onClick={() => onToggleCategory(node.key)}
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <span className="flex-1 text-start">{node.label}</span>
          <button
            type="button"
            className="rounded px-1 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            onClick={(e) => {
              e.stopPropagation();
              onGroupToggle(node.channelIds, allActive);
            }}
          >
            {allActive || someActive ? 'None' : 'All'}
          </button>
        </button>
      </div>
    );
  }

  if (node.type === 'entity') {
    const expanded = expandedEntities.has(node.key);
    const allActive =
      node.channelIds.length > 0 && node.channelIds.every((id) => activeChannels.has(id));
    const someActive = node.channelIds.some((id) => activeChannels.has(id));

    return (
      <div className="select-none">
        <button
          type="button"
          className="flex w-full items-center gap-1 ps-4 pe-1.5 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--layer-raised)]"
          onClick={() => onToggleEntity(node.key)}
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <span className="flex-1 truncate text-start">{node.label}</span>
          <button
            type="button"
            className="rounded px-1 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            onClick={(e) => {
              e.stopPropagation();
              onGroupToggle(node.channelIds, allActive);
            }}
          >
            {allActive || someActive ? 'None' : 'All'}
          </button>
        </button>
      </div>
    );
  }

  // Channel row
  const isActive = activeChannels.has(node.channelId);
  const colorIdx = colorIndexMap.get(node.channelId);
  const color = colorIdx !== undefined ? chartColors[colorIdx % chartColors.length] : undefined;

  return (
    <label className="flex cursor-pointer items-center gap-1.5 ps-8 pe-1.5 py-0.5 text-xs hover:bg-[var(--layer-raised)]">
      <input
        type="checkbox"
        checked={isActive}
        onChange={() => onToggleChannel(node.channelId)}
        className="size-3 shrink-0 accent-[var(--accent)]"
      />
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? 'var(--text-disabled)', opacity: isActive ? 1 : 0.35 }}
      />
      <span className="flex-1 truncate text-[var(--text-primary)]">{node.label}</span>
      {node.unit && <span className="shrink-0 text-[var(--text-tertiary)]">{node.unit}</span>}
    </label>
  );
}
