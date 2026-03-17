import {
  type AbstractMesh,
  Color4,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

import type { MaterialFactory } from './materials.js';

const ACCENT_COLOR = new Color4(0.06, 0.38, 0.996, 1.0);
const HOVER_COLOR = new Color4(0.06, 0.38, 0.996, 0.6);
const SELECTION_EDGE_WIDTH = 3.0;
const HOVER_EDGE_WIDTH = 1.5;
const EDGE_EPSILON = 0.9999;

export interface SelectionVisuals {
  applySelection: (meshes: AbstractMesh[]) => void;
  applyHover: (mesh: AbstractMesh | null) => void;
  clearAll: () => void;
  dispose: () => void;
}

/**
 * Edge-outline selection with material tinting.
 * Replaces HighlightLayer glow with crisp CAD-style feature edges.
 */
export function createSelectionVisuals(
  scene: Scene,
  materialFactory: MaterialFactory,
): SelectionVisuals {
  const selectedMeshes = new Set<AbstractMesh>();
  let hoveredMesh: AbstractMesh | null = null;

  function enableEdges(mesh: AbstractMesh, width: number, color: Color4): void {
    (mesh as Mesh).enableEdgesRendering?.(EDGE_EPSILON);
    mesh.edgesWidth = width;
    mesh.edgesColor = color;
  }

  function disableEdges(mesh: AbstractMesh): void {
    (mesh as Mesh).disableEdgesRendering?.();
  }

  function applySelection(meshes: AbstractMesh[]): void {
    // Clear previous selection
    for (const mesh of selectedMeshes) {
      disableEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
    }
    selectedMeshes.clear();

    // Apply new selection
    for (const mesh of meshes) {
      enableEdges(mesh, SELECTION_EDGE_WIDTH, ACCENT_COLOR);
      materialFactory.applySelectionTint(mesh);
      selectedMeshes.add(mesh);
    }
  }

  function applyHover(mesh: AbstractMesh | null): void {
    // Clear previous hover
    if (hoveredMesh && !selectedMeshes.has(hoveredMesh)) {
      disableEdges(hoveredMesh);
    }
    hoveredMesh = null;

    // Apply new hover (skip if already selected)
    if (mesh && !selectedMeshes.has(mesh)) {
      enableEdges(mesh, HOVER_EDGE_WIDTH, HOVER_COLOR);
      hoveredMesh = mesh;
    }
  }

  function clearAll(): void {
    for (const mesh of selectedMeshes) {
      disableEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
    }
    selectedMeshes.clear();

    if (hoveredMesh) {
      disableEdges(hoveredMesh);
      hoveredMesh = null;
    }
  }

  return {
    applySelection,
    applyHover,
    clearAll,
    dispose: clearAll,
  };
}
