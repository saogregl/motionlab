/**
 * Shared helpers for viewport Storybook stories.
 *
 * Mesh generators, UI constants, and reusable components extracted from
 * scene-graph.stories.tsx to avoid duplication across story files.
 */

import type { CameraPreset, MeshDataInput } from './scene-graph-three.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeshDataWithTopology extends MeshDataInput {
  readonly partIndex: Uint32Array;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

/**
 * Generate a simple box mesh (24 vertices, 12 triangles) for demo purposes.
 */
export function createBoxMeshData(sx = 1, sy = 1, sz = 1) {
  const hx = sx / 2,
    hy = sy / 2,
    hz = sz / 2;

  // prettier-ignore
  const positions = [
    // Front face
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
    // Back face
    -hx, -hy, -hz, -hx, hy, -hz, hx, hy, -hz, hx, -hy, -hz,
    // Top face
    -hx, hy, -hz, -hx, hy, hz, hx, hy, hz, hx, hy, -hz,
    // Bottom face
    -hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz,
    // Right face
    hx, -hy, -hz, hx, hy, -hz, hx, hy, hz, hx, -hy, hz,
    // Left face
    -hx, -hy, -hz, -hx, -hy, hz, -hx, hy, hz, -hx, hy, -hz,
  ];

  // prettier-ignore
  const normals = [
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];

  // prettier-ignore
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16,
    18, 19, 20, 21, 22, 20, 22, 23,
  ];

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Box with B-Rep face topology: 6 faces, 2 triangles each.
 * Face order: front, back, top, bottom, right, left.
 */
export function createBoxMeshDataWithTopology(sx = 1, sy = 1, sz = 1): MeshDataWithTopology {
  const base = createBoxMeshData(sx, sy, sz);
  // 6 faces, each face is a quad = 2 triangles
  return { ...base, partIndex: new Uint32Array([2, 2, 2, 2, 2, 2]) };
}

/**
 * Generate a UV sphere mesh.
 */
export function createSphereMeshData(radius = 1, segments = 48, rings = 32) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring++) {
    const theta = (ring * Math.PI) / rings;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let seg = 0; seg <= segments; seg++) {
      const phi = (seg * 2 * Math.PI) / segments;
      const x = sinTheta * Math.cos(phi);
      const y = cosTheta;
      const z = sinTheta * Math.sin(phi);

      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
    }
  }

  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * (segments + 1) + seg;
      const b = a + segments + 1;
      indices.push(a, b + 1, b);
      indices.push(a, a + 1, b + 1);
    }
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Sphere with B-Rep face topology: 1 face (entire surface).
 */
export function createSphereMeshDataWithTopology(
  radius = 1,
  segments = 48,
  rings = 32,
): MeshDataWithTopology {
  const base = createSphereMeshData(radius, segments, rings);
  const totalTriangles = base.indices.length / 3;
  return { ...base, partIndex: new Uint32Array([totalTriangles]) };
}

/**
 * Generate a cylinder mesh.
 */
export function createCylinderMeshData(radiusTop = 0.5, radiusBottom = 0.5, height = 2, segments = 48) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const halfH = height / 2;

  // Side vertices
  for (let i = 0; i <= 1; i++) {
    const y = i === 0 ? -halfH : halfH;
    const r = i === 0 ? radiusBottom : radiusTop;
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      positions.push(x, y, z);
      normals.push(nx, 0, nz);
    }
  }

  // Side indices
  for (let s = 0; s < segments; s++) {
    const a = s;
    const b = s + segments + 1;
    indices.push(a, b, b + 1);
    indices.push(a, b + 1, a + 1);
  }

  // Top cap
  const topCenter = positions.length / 3;
  positions.push(0, halfH, 0);
  normals.push(0, 1, 0);
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radiusTop, halfH, Math.sin(angle) * radiusTop);
    normals.push(0, 1, 0);
  }
  for (let s = 0; s < segments; s++) {
    indices.push(topCenter, topCenter + 1 + s + 1, topCenter + 1 + s);
  }

  // Bottom cap
  const botCenter = positions.length / 3;
  positions.push(0, -halfH, 0);
  normals.push(0, -1, 0);
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radiusBottom, -halfH, Math.sin(angle) * radiusBottom);
    normals.push(0, -1, 0);
  }
  for (let s = 0; s < segments; s++) {
    indices.push(botCenter, botCenter + 1 + s, botCenter + 1 + s + 1);
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Cylinder with B-Rep face topology: 3 faces (side, top cap, bottom cap).
 */
export function createCylinderMeshDataWithTopology(
  radiusTop = 0.5,
  radiusBottom = 0.5,
  height = 2,
  segments = 48,
): MeshDataWithTopology {
  const base = createCylinderMeshData(radiusTop, radiusBottom, height, segments);
  // Side: segments * 2 triangles, top cap: segments, bottom cap: segments
  return {
    ...base,
    partIndex: new Uint32Array([segments * 2, segments, segments]),
  };
}

/**
 * Generate a torus mesh.
 */
export function createTorusMeshData(
  majorRadius = 1,
  minorRadius = 0.3,
  majorSegments = 48,
  minorSegments = 24,
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= majorSegments; i++) {
    const u = (i / majorSegments) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);

    for (let j = 0; j <= minorSegments; j++) {
      const v = (j / minorSegments) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);

      const x = (majorRadius + minorRadius * cv) * cu;
      const y = minorRadius * sv;
      const z = (majorRadius + minorRadius * cv) * su;

      const nx = cv * cu;
      const ny = sv;
      const nz = cv * su;

      positions.push(x, y, z);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < majorSegments; i++) {
    for (let j = 0; j < minorSegments; j++) {
      const a = i * (minorSegments + 1) + j;
      const b = a + minorSegments + 1;
      indices.push(a, b + 1, b);
      indices.push(a, a + 1, b + 1);
    }
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Torus with B-Rep face topology: 1 face (entire surface).
 */
export function createTorusMeshDataWithTopology(
  majorRadius = 1,
  minorRadius = 0.3,
  majorSegments = 48,
  minorSegments = 24,
): MeshDataWithTopology {
  const base = createTorusMeshData(majorRadius, minorRadius, majorSegments, minorSegments);
  const totalTriangles = base.indices.length / 3;
  return { ...base, partIndex: new Uint32Array([totalTriangles]) };
}

// ---------------------------------------------------------------------------
// Shared UI constants
// ---------------------------------------------------------------------------

export const CAMERA_PRESETS: CameraPreset[] = [
  'isometric',
  'fit-all',
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
];

export const TOOLBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  gap: 4,
  zIndex: 10,
  flexWrap: 'wrap',
};

export const BUTTON_STYLE: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'system-ui, sans-serif',
  background: 'rgba(30,30,46,0.85)',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 4,
  cursor: 'pointer',
};

export const ACTIVE_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  background: 'rgba(15,98,254,0.85)',
  borderColor: '#0f62fe',
};

export const STATUS_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  cursor: 'default',
  fontSize: 10,
  opacity: 0.8,
  maxWidth: 360,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const SEPARATOR_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  cursor: 'default',
  opacity: 0.6,
};
