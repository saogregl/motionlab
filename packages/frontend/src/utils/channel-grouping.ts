import type { ChannelDescriptor } from '../stores/simulation.js';

export interface ParsedChannelId {
  category: string; // 'joint' | 'load' | 'actuator' | other
  entityId: string;
  property: string; // everything after category/entityId/
}

/**
 * Parses a channel ID like "joint/<uuid>/coord/rot_z" into its parts.
 */
export function parseChannelId(channelId: string): ParsedChannelId {
  const firstSlash = channelId.indexOf('/');
  if (firstSlash === -1) {
    return { category: channelId, entityId: '', property: '' };
  }
  const secondSlash = channelId.indexOf('/', firstSlash + 1);
  if (secondSlash === -1) {
    return {
      category: channelId.slice(0, firstSlash),
      entityId: channelId.slice(firstSlash + 1),
      property: '',
    };
  }
  return {
    category: channelId.slice(0, firstSlash),
    entityId: channelId.slice(firstSlash + 1, secondSlash),
    property: channelId.slice(secondSlash + 1),
  };
}

// ---------------------------------------------------------------------------
// Tree node types for the channel browser
// ---------------------------------------------------------------------------

export interface CategoryNode {
  type: 'category';
  key: string; // e.g. 'joints'
  label: string; // e.g. 'Joints'
  channelIds: string[]; // all channels in this category
}

export interface EntityNode {
  type: 'entity';
  key: string; // e.g. 'joint/<uuid>'
  label: string; // resolved entity name
  category: string;
  channelIds: string[]; // all channels for this entity
}

export interface ChannelNode {
  type: 'channel';
  channelId: string;
  label: string; // display name (from descriptor)
  unit: string;
}

export type BrowserNode = CategoryNode | EntityNode | ChannelNode;

const CATEGORY_LABELS: Record<string, string> = {
  joint: 'Joints',
  load: 'Loads',
  actuator: 'Actuators',
};

const CATEGORY_ORDER = ['joint', 'load', 'actuator'];

/**
 * Builds a flat list of tree nodes for the channel browser from channel
 * descriptors and mechanism entity maps. Applies optional search filter.
 */
export function buildChannelGroups(
  descriptors: ChannelDescriptor[],
  entityNames: Map<string, string>, // entityId -> display name
  filter: string,
  expandedCategories: Set<string>,
  expandedEntities: Set<string>,
): BrowserNode[] {
  const lowerFilter = filter.toLowerCase();

  // Group descriptors by category -> entityId
  const catMap = new Map<string, Map<string, ChannelDescriptor[]>>();

  for (const desc of descriptors) {
    const parsed = parseChannelId(desc.channelId);
    const { category, entityId } = parsed;

    // Apply filter: match on channel name, entity name, or category
    if (lowerFilter) {
      const entityName = entityNames.get(entityId) ?? entityId;
      const matchesChannel = desc.name.toLowerCase().includes(lowerFilter);
      const matchesEntity = entityName.toLowerCase().includes(lowerFilter);
      const matchesCategory = (CATEGORY_LABELS[category] ?? category)
        .toLowerCase()
        .includes(lowerFilter);
      if (!matchesChannel && !matchesEntity && !matchesCategory) continue;
    }

    let entityMap = catMap.get(category);
    if (!entityMap) {
      entityMap = new Map();
      catMap.set(category, entityMap);
    }
    let channels = entityMap.get(entityId);
    if (!channels) {
      channels = [];
      entityMap.set(entityId, channels);
    }
    channels.push(desc);
  }

  // Build flat node list in category order
  const nodes: BrowserNode[] = [];

  // Process known categories first, then any unknowns
  const allCategories = [...new Set([...CATEGORY_ORDER, ...catMap.keys()])];

  for (const cat of allCategories) {
    const entityMap = catMap.get(cat);
    if (!entityMap) continue;

    const allCatChannelIds: string[] = [];
    for (const descs of entityMap.values()) {
      for (const d of descs) allCatChannelIds.push(d.channelId);
    }

    nodes.push({
      type: 'category',
      key: cat,
      label: CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1),
      channelIds: allCatChannelIds,
    });

    if (!expandedCategories.has(cat)) continue;

    // Sort entities by name
    const entities = [...entityMap.entries()].sort((a, b) => {
      const nameA = entityNames.get(a[0]) ?? a[0];
      const nameB = entityNames.get(b[0]) ?? b[0];
      return nameA.localeCompare(nameB);
    });

    for (const [entityId, descs] of entities) {
      const entityKey = `${cat}/${entityId}`;
      const entityChannelIds = descs.map((d) => d.channelId);

      nodes.push({
        type: 'entity',
        key: entityKey,
        label: entityNames.get(entityId) ?? entityId.slice(0, 8),
        category: cat,
        channelIds: entityChannelIds,
      });

      if (!expandedEntities.has(entityKey)) continue;

      for (const desc of descs) {
        nodes.push({
          type: 'channel',
          channelId: desc.channelId,
          label: desc.name,
          unit: desc.unit,
        });
      }
    }
  }

  return nodes;
}

/**
 * Collects all entity IDs and their display names from mechanism store maps.
 */
export function collectEntityNames(
  joints: Map<string, { id: string; name: string }>,
  loads: Map<string, { id: string; name: string }>,
  actuators: Map<string, { id: string; name: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const j of joints.values()) names.set(j.id, j.name);
  for (const l of loads.values()) names.set(l.id, l.name);
  for (const a of actuators.values()) names.set(a.id, a.name);
  return names;
}
