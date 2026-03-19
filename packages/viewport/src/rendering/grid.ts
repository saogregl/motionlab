import { type AbstractMesh, Color4, CreateLineSystem, type Scene, Vector3 } from '@babylonjs/core';

export interface GridOptions {
  visible?: boolean;
  gridSize?: number;
  step?: number;
}

export interface GridOverlay {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Optional ground-plane grid with design-token axis colors.
 * Off by default (CAD convention).
 */
export function createGrid(scene: Scene, options?: GridOptions): GridOverlay {
  const gridSize = options?.gridSize ?? 50;
  const step = options?.step ?? 1;
  const initialVisible = options?.visible ?? false;

  const gridColor = new Color4(0.3, 0.3, 0.3, 0.4);

  const lines: Vector3[][] = [];
  const colors: Color4[][] = [];

  // Lines parallel to X axis (varying Z)
  for (let z = -gridSize; z <= gridSize; z += step) {
    if (z === 0) continue;
    lines.push([new Vector3(-gridSize, 0, z), new Vector3(gridSize, 0, z)]);
    colors.push([gridColor, gridColor]);
  }

  // Lines parallel to Z axis (varying X)
  for (let x = -gridSize; x <= gridSize; x += step) {
    if (x === 0) continue;
    lines.push([new Vector3(x, 0, -gridSize), new Vector3(x, 0, gridSize)]);
    colors.push([gridColor, gridColor]);
  }

  const gridMesh = CreateLineSystem('grid_lines', { lines, colors, useVertexAlpha: true }, scene);
  gridMesh.isPickable = false;

  // X axis — design token #d94b4b
  const xAxisColor = new Color4(0.851, 0.294, 0.294, 1.0);
  const xAxis = CreateLineSystem(
    'axis_x',
    {
      lines: [[new Vector3(-gridSize, 0, 0), new Vector3(gridSize, 0, 0)]],
      colors: [[xAxisColor, xAxisColor]],
    },
    scene,
  );
  xAxis.isPickable = false;

  // Z axis — design token #3b74f2
  const zAxisColor = new Color4(0.231, 0.455, 0.949, 1.0);
  const zAxis = CreateLineSystem(
    'axis_z',
    {
      lines: [[new Vector3(0, 0, -gridSize), new Vector3(0, 0, gridSize)]],
      colors: [[zAxisColor, zAxisColor]],
    },
    scene,
  );
  zAxis.isPickable = false;

  const nodes: AbstractMesh[] = [gridMesh, xAxis, zAxis];

  let _visible = initialVisible;
  for (const node of nodes) {
    node.setEnabled(_visible);
  }

  return {
    get visible() {
      return _visible;
    },

    setVisible(visible: boolean) {
      _visible = visible;
      for (const node of nodes) {
        node.setEnabled(visible);
      }
    },

    dispose() {
      for (const node of nodes) {
        node.dispose();
      }
    },
  };
}
