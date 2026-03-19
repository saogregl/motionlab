import { type AbstractMesh, Color4, type Mesh, type Scene } from '@babylonjs/core';

import type { MaterialFactory } from './materials.js';

const ACCENT_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 1.0);
const HOVER_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 0.6);
const SELECTION_EDGE_WIDTH = 8.0;
const HOVER_EDGE_WIDTH = 5.0;

/** Default always-on subtle edges (must match scene-graph addBody values) */
const DEFAULT_EDGE_WIDTH = 2.0;
const DEFAULT_EDGE_COLOR = new Color4(0.15, 0.15, 0.2, 0.3);
const EDGE_EPSILON = 0.9999;

export interface SelectionVisuals {
  applySelection: (meshes: AbstractMesh[]) => void;
  applyHover: (mesh: AbstractMesh | null) => void;
  clearAll: () => void;
  dispose: () => void;
}

/**
 * Selection feedback via material tinting + thicker edge overlay.
 * Restores default subtle edges on deselect/dehover.
 */
export function createSelectionVisuals(
  _scene: Scene,
  materialFactory: MaterialFactory,
): SelectionVisuals {
  const selectedMeshes = new Set<AbstractMesh>();
  let hoveredMesh: AbstractMesh | null = null;

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

  function applySelection(meshes: AbstractMesh[]): void {
    for (const mesh of selectedMeshes) {
      restoreDefaultEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
    }
    selectedMeshes.clear();

    for (const mesh of meshes) {
      setEdges(mesh, SELECTION_EDGE_WIDTH, ACCENT_EDGE_COLOR);
      materialFactory.applySelectionTint(mesh);
      selectedMeshes.add(mesh);
    }
  }

  function applyHover(mesh: AbstractMesh | null): void {
    if (hoveredMesh && !selectedMeshes.has(hoveredMesh)) {
      restoreDefaultEdges(hoveredMesh);
    }
    hoveredMesh = null;

    if (mesh && !selectedMeshes.has(mesh)) {
      setEdges(mesh, HOVER_EDGE_WIDTH, HOVER_EDGE_COLOR);
      hoveredMesh = mesh;
    }
  }

  function clearAll(): void {
    for (const mesh of selectedMeshes) {
      restoreDefaultEdges(mesh);
      materialFactory.removeSelectionTint(mesh);
    }
    selectedMeshes.clear();

    if (hoveredMesh) {
      restoreDefaultEdges(hoveredMesh);
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
