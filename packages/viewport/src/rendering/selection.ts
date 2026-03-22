import {
  type AbstractMesh,
  Color3,
  Color4,
  HighlightLayer,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

import type { MaterialFactory } from './materials.js';

const ACCENT_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 1.0);
const HOVER_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 0.6);
const SELECTION_EDGE_WIDTH = 8.0;
const HOVER_EDGE_WIDTH = 5.0;

/** Default always-on subtle edges (must match scene-graph addBody values) */
const DEFAULT_EDGE_WIDTH = 2.0;
const DEFAULT_EDGE_COLOR = new Color4(0.15, 0.15, 0.2, 0.3);
const EDGE_EPSILON = 0.9999;

/** HighlightLayer glow colors */
const SELECTION_HIGHLIGHT_COLOR = new Color3(0.06, 0.38, 0.996);
const HOVER_HIGHLIGHT_COLOR = new Color3(0.06, 0.38, 0.996);

export interface SelectionVisuals {
  applySelection: (meshes: AbstractMesh[]) => void;
  applyHover: (mesh: AbstractMesh | null) => void;
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

  function applySelection(meshes: AbstractMesh[]): void {
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

    for (const mesh of meshes) {
      setEdges(mesh, SELECTION_EDGE_WIDTH, ACCENT_EDGE_COLOR);
      materialFactory.applySelectionTint(mesh);
      highlightLayer.addMesh(mesh as Mesh, SELECTION_HIGHLIGHT_COLOR);
      selectedMeshes.add(mesh);
    }
  }

  function applyHover(mesh: AbstractMesh | null): void {
    if (hoveredMesh && !selectedMeshes.has(hoveredMesh)) {
      restoreDefaultEdges(hoveredMesh);
      highlightLayer.removeMesh(hoveredMesh as Mesh);
    }
    hoveredMesh = null;

    if (mesh && !selectedMeshes.has(mesh)) {
      setEdges(mesh, HOVER_EDGE_WIDTH, HOVER_EDGE_COLOR);
      highlightLayer.addMesh(mesh as Mesh, HOVER_HIGHLIGHT_COLOR, true);
      hoveredMesh = mesh;
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
