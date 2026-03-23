import {
  type AbstractMesh,
  Color4,
  HighlightLayer,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

import {
  DEFAULT_EDGE as DEFAULT_EDGE_COLOR,
  ENTITY_ACTUATOR,
  ENTITY_BODY,
  ENTITY_DATUM,
  ENTITY_GROUND,
  ENTITY_JOINT,
  ENTITY_LOAD,
} from './colors.js';
import type { MaterialFactory } from './materials.js';

// ---------------------------------------------------------------------------
// Entity-type selection/hover colors
// ---------------------------------------------------------------------------

/**
 * Entity-type selection/hover colors.
 * Designed for readability against the CAD-neutral gray material palette
 * and dark viewport background.
 */
export const ENTITY_COLORS = {
  body: { hex: '#4A90D9', color3: ENTITY_BODY },
  datum: { hex: '#50C878', color3: ENTITY_DATUM },
  joint: { hex: '#FF8C00', color3: ENTITY_JOINT },
  load: { hex: '#DC143C', color3: ENTITY_LOAD },
  actuator: { hex: '#9370DB', color3: ENTITY_ACTUATOR },
  ground: { hex: '#808080', color3: ENTITY_GROUND },
} as const;

export type EntityColorType = keyof typeof ENTITY_COLORS;

export interface SelectionMeshEntry {
  mesh: AbstractMesh;
  entityType: EntityColorType;
}

/** Pre-computed Color4 edge variants per entity type (avoids per-selection allocation). */
const ENTITY_EDGE_COLORS = Object.fromEntries(
  Object.entries(ENTITY_COLORS).map(([key, { color3: c }]) => [
    key,
    {
      selection: new Color4(c.r, c.g, c.b, 1.0),
      hover: new Color4(c.r, c.g, c.b, 0.6),
    },
  ]),
) as Record<EntityColorType, { selection: Color4; hover: Color4 }>;

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

const SELECTION_EDGE_WIDTH = 8.0;
const HOVER_EDGE_WIDTH = 5.0;

/** Default always-on subtle edges (must match scene-graph addBody values) */
const DEFAULT_EDGE_WIDTH = 2.0;
const EDGE_EPSILON = 0.9999;

// ---------------------------------------------------------------------------
// SelectionVisuals
// ---------------------------------------------------------------------------

export interface SelectionVisuals {
  applySelection: (entries: SelectionMeshEntry[]) => void;
  applyHover: (entry: SelectionMeshEntry | null) => void;
  clearAll: () => void;
  dispose: () => void;
}

/**
 * Selection feedback via HighlightLayer glow + thicker edge overlay + material tinting.
 * The HighlightLayer provides a visible glow outline around selected/hovered meshes
 * similar to CAD tools like Solidworks and Fusion 360.
 */
export function createSelectionVisuals(
  scene: Scene,
  materialFactory: MaterialFactory,
): SelectionVisuals {
  const selectedMeshes = new Set<AbstractMesh>();
  let hoveredMesh: AbstractMesh | null = null;

  // HighlightLayer for glow outlines
  const highlightLayer = new HighlightLayer('selection_highlight', scene, {
    blurHorizontalSize: 0.4,
    blurVerticalSize: 0.4,
    mainTextureRatio: 0.5,
  });
  // Render the inner glow at reduced intensity so it's a halo, not a flood
  highlightLayer.innerGlow = false;

  function setEdges(mesh: AbstractMesh, width: number, color: Color4): void {
    (mesh as Mesh).enableEdgesRendering?.(EDGE_EPSILON);
    mesh.edgesWidth = width;
    mesh.edgesColor = color;
  }

  function restoreDefaultEdges(mesh: AbstractMesh): void {
    (mesh as Mesh).enableEdgesRendering?.(EDGE_EPSILON);
    mesh.edgesWidth = DEFAULT_EDGE_WIDTH;
    mesh.edgesColor = DEFAULT_EDGE_COLOR;
  }

  function applySelection(entries: SelectionMeshEntry[]): void {
    // Remove highlight from previously selected meshes
    for (const mesh of selectedMeshes) {
      restoreDefaultEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
      highlightLayer.removeMesh(mesh as Mesh);
    }
    selectedMeshes.clear();

    // Remove hover highlight if the hovered mesh is now selected
    if (hoveredMesh) {
      highlightLayer.removeMesh(hoveredMesh as Mesh);
    }

    for (const { mesh, entityType } of entries) {
      const color = ENTITY_COLORS[entityType];
      setEdges(mesh, SELECTION_EDGE_WIDTH, ENTITY_EDGE_COLORS[entityType].selection);
      materialFactory.applySelectionTint(mesh, color.color3);
      highlightLayer.addMesh(mesh as Mesh, color.color3);
      selectedMeshes.add(mesh);
    }
  }

  function applyHover(entry: SelectionMeshEntry | null): void {
    if (hoveredMesh && !selectedMeshes.has(hoveredMesh)) {
      restoreDefaultEdges(hoveredMesh);
      highlightLayer.removeMesh(hoveredMesh as Mesh);
    }
    hoveredMesh = null;

    if (entry && !selectedMeshes.has(entry.mesh)) {
      const color = ENTITY_COLORS[entry.entityType];
      setEdges(entry.mesh, HOVER_EDGE_WIDTH, ENTITY_EDGE_COLORS[entry.entityType].hover);
      highlightLayer.addMesh(entry.mesh as Mesh, color.color3, true);
      hoveredMesh = entry.mesh;
    }
  }

  function clearAll(): void {
    for (const mesh of selectedMeshes) {
      restoreDefaultEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
      highlightLayer.removeMesh(mesh as Mesh);
    }
    selectedMeshes.clear();

    if (hoveredMesh) {
      restoreDefaultEdges(hoveredMesh);
      highlightLayer.removeMesh(hoveredMesh as Mesh);
      hoveredMesh = null;
    }
  }

  function dispose(): void {
    clearAll();
    highlightLayer.dispose();
  }

  return {
    applySelection,
    applyHover,
    clearAll,
    dispose,
  };
}
