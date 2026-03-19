import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';
import { PickingManager } from './picking.js';
import type { CameraPreset, SceneGraphManager } from './scene-graph.js';
import { Viewport } from './Viewport.js';

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

/**
 * Generate a simple box mesh (8 vertices, 12 triangles) for demo purposes.
 */
function createBoxMeshData(sx = 1, sy = 1, sz = 1) {
  const hx = sx / 2,
    hy = sy / 2,
    hz = sz / 2;

  // prettier-ignore
  const positions = [
    // Front face
    -hx,
    -hy,
    hz,
    hx,
    -hy,
    hz,
    hx,
    hy,
    hz,
    -hx,
    hy,
    hz,
    // Back face
    -hx,
    -hy,
    -hz,
    -hx,
    hy,
    -hz,
    hx,
    hy,
    -hz,
    hx,
    -hy,
    -hz,
    // Top face
    -hx,
    hy,
    -hz,
    -hx,
    hy,
    hz,
    hx,
    hy,
    hz,
    hx,
    hy,
    -hz,
    // Bottom face
    -hx,
    -hy,
    -hz,
    hx,
    -hy,
    -hz,
    hx,
    -hy,
    hz,
    -hx,
    -hy,
    hz,
    // Right face
    hx,
    -hy,
    -hz,
    hx,
    hy,
    -hz,
    hx,
    hy,
    hz,
    hx,
    -hy,
    hz,
    // Left face
    -hx,
    -hy,
    -hz,
    -hx,
    -hy,
    hz,
    -hx,
    hy,
    hz,
    -hx,
    hy,
    -hz,
  ];

  // prettier-ignore
  const normals = [
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];

  // prettier-ignore
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 8, 11, 10, 12, 14, 13, 12, 15, 14, 16, 18, 17, 16,
    19, 18, 20, 22, 21, 20, 23, 22,
  ];

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a UV sphere mesh.
 */
function createSphereMeshData(radius = 1, segments = 48, rings = 32) {
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
      indices.push(a, b, b + 1);
      indices.push(a, b + 1, a + 1);
    }
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a cylinder mesh.
 */
function createCylinderMeshData(radiusTop = 0.5, radiusBottom = 0.5, height = 2, segments = 48) {
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

  // Side indices (a = bottom ring, b = top ring — opposite layout from sphere)
  for (let s = 0; s < segments; s++) {
    const a = s;
    const b = s + segments + 1;
    indices.push(a, b + 1, b);
    indices.push(a, a + 1, b + 1);
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
    indices.push(topCenter, topCenter + 1 + s, topCenter + 1 + s + 1);
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
    indices.push(botCenter, botCenter + 1 + s + 1, botCenter + 1 + s);
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a torus mesh.
 */
function createTorusMeshData(
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
      indices.push(a, b, b + 1);
      indices.push(a, b + 1, a + 1);
    }
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

const CAMERA_PRESETS: CameraPreset[] = [
  'isometric',
  'fit-all',
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
];

const TOOLBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  gap: 4,
  zIndex: 10,
  flexWrap: 'wrap',
};

const BUTTON_STYLE: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'system-ui, sans-serif',
  background: 'rgba(30,30,46,0.85)',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 4,
  cursor: 'pointer',
};

const ACTIVE_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  background: 'rgba(15,98,254,0.85)',
  borderColor: '#0f62fe',
};

const STATUS_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  cursor: 'default',
  fontSize: 10,
  opacity: 0.8,
  maxWidth: 360,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta = {
  title: 'Viewport/SceneGraph',
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Showcase (updated with new pipeline)
// ---------------------------------------------------------------------------

function SceneGraphShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [bodyCount, setBodyCount] = useState(0);
  const nextId = useRef(0);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    sg.addBody('demo-0', 'Box 0', createBoxMeshData(2, 1, 1.5), {
      position: [0, 0.5, 0],
      rotation: [0, 0, 0, 1],
    });
    nextId.current = 1;
    setBodyCount(1);
    sg.fitAll();
  }, []);

  const addBody = () => {
    const sg = sgRef.current;
    if (!sg) return;
    const id = nextId.current++;
    const x = (Math.random() - 0.5) * 10;
    const z = (Math.random() - 0.5) * 10;
    const sx = 0.5 + Math.random() * 2;
    const sy = 0.5 + Math.random() * 2;
    const sz = 0.5 + Math.random() * 2;
    sg.addBody(`demo-${id}`, `Box ${id}`, createBoxMeshData(sx, sy, sz), {
      position: [x, sy / 2, z],
      rotation: [0, 0, 0, 1],
    });
    setBodyCount((c) => c + 1);
  };

  const clearBodies = () => {
    const sg = sgRef.current;
    if (!sg) return;
    for (const entity of sg.getAllEntities()) {
      sg.removeBody(entity.id);
    }
    nextId.current = 0;
    setBodyCount(0);
  };

  const toggleGrid = () => {
    sgRef.current?.toggleGrid();
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <button type="button" style={BUTTON_STYLE} onClick={addBody}>
          + Add Body
        </button>
        <button type="button" style={BUTTON_STYLE} onClick={clearBodies}>
          Clear ({bodyCount})
        </button>
        <button type="button" style={BUTTON_STYLE} onClick={toggleGrid}>
          Toggle Grid
        </button>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} />
    </div>
  );
}

export const Showcase: Story = {
  render: () => <SceneGraphShowcase />,
};

// ---------------------------------------------------------------------------
// Lighting story
// ---------------------------------------------------------------------------

function LightingShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // 4 spheres on ground plane
    const positions = [
      [-2, 1, -2],
      [2, 1, -2],
      [-2, 1, 2],
      [2, 1, 2],
    ];
    positions.forEach((pos, i) => {
      sg.addBody(`sphere-${i}`, `Sphere ${i}`, createSphereMeshData(0.8), {
        position: pos as [number, number, number],
        rotation: [0, 0, 0, 1],
      });
    });
    sg.fitAll();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} />
    </div>
  );
}

export const Lighting: Story = {
  render: () => <LightingShowcase />,
};

// ---------------------------------------------------------------------------
// Materials story
// ---------------------------------------------------------------------------

function MaterialsShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // 5 objects showing each material preset
    // Uses the default aluminum material from the factory. For a full demo,
    // you'd need to access the materialFactory directly. Here we show geometry variety.
    const meshes = [
      { name: 'Steel Sphere', data: createSphereMeshData(0.7), pos: [-4, 0.7, 0] },
      { name: 'Aluminum Box', data: createBoxMeshData(1.2, 1.2, 1.2), pos: [-2, 0.6, 0] },
      { name: 'Plastic Cylinder', data: createCylinderMeshData(0.5, 0.5, 1.4), pos: [0, 0.7, 0] },
      { name: 'White Torus', data: createTorusMeshData(0.6, 0.2), pos: [2, 0.5, 0] },
      { name: 'Rubber Box', data: createBoxMeshData(1, 0.5, 1), pos: [4, 0.25, 0] },
    ];

    meshes.forEach((m, i) => {
      sg.addBody(`mat-${i}`, m.name, m.data, {
        position: m.pos as [number, number, number],
        rotation: [0, 0, 0, 1],
      });
    });

    sg.fitAll();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} />
    </div>
  );
}

export const Materials: Story = {
  render: () => <MaterialsShowcase />,
};

// ---------------------------------------------------------------------------
// Post-Processing story
// ---------------------------------------------------------------------------

function PostProcessingShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [ssao, setSsao] = useState(false);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // Closely placed objects to show SSAO in crevices
    sg.addBody('pp-box1', 'Box 1', createBoxMeshData(2, 2, 2), {
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('pp-box2', 'Box 2', createBoxMeshData(1, 3, 1), {
      position: [1.5, 1.5, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('pp-sphere', 'Sphere', createSphereMeshData(0.6), {
      position: [0, 2.6, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.fitAll();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <button
          type="button"
          style={ssao ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={() => setSsao(!ssao)}
        >
          SSAO: {ssao ? 'ON' : 'OFF'}
        </button>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} ssaoEnabled={ssao} />
    </div>
  );
}

export const PostProcessing: Story = {
  render: () => <PostProcessingShowcase />,
};

// ---------------------------------------------------------------------------
// Selection story (replaces Picking)
// ---------------------------------------------------------------------------

function SelectionShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const pickingRef = useRef<PickingManager | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    sg.addBody('sel-box', 'Box', createBoxMeshData(2, 1, 1.5), {
      position: [-3, 0.5, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sel-sphere', 'Sphere', createSphereMeshData(0.8), {
      position: [0, 0.8, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sel-cylinder', 'Cylinder', createCylinderMeshData(0.5, 0.5, 1.5), {
      position: [3, 0.75, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.fitAll();

    const picking = new PickingManager(
      sg.scene,
      sg,
      (entityId, modifiers) => {
        setSelectedIds((prev) => {
          let next: Set<string>;
          if (entityId == null) {
            next = new Set();
          } else if (modifiers.ctrl) {
            next = new Set(prev);
            if (next.has(entityId)) {
              next.delete(entityId);
            } else {
              next.add(entityId);
            }
          } else {
            next = new Set([entityId]);
          }
          sg.applySelection(next);
          return next;
        });
      },
      (entityId) => {
        setHoveredId(entityId);
        sg.applyHover(entityId);
      },
    );
    pickingRef.current = picking;
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>
          Selected: {selectedIds.size > 0 ? Array.from(selectedIds).join(', ') : '(none)'}
        </span>
        <span style={STATUS_STYLE}>Hover: {hoveredId ?? '(none)'}</span>
        <button
          type="button"
          style={BUTTON_STYLE}
          onClick={() => {
            const empty = new Set<string>();
            setSelectedIds(empty);
            sgRef.current?.applySelection(empty);
          }}
        >
          Clear Selection
        </button>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', fontSize: 9, opacity: 0.6 }}>
          Ctrl+click for multi-select
        </span>
      </div>
      <Viewport onSceneReady={handleSceneReady} />
    </div>
  );
}

export const Selection: Story = {
  render: () => <SelectionShowcase />,
};

// ---------------------------------------------------------------------------
// Grid story
// ---------------------------------------------------------------------------

function GridShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [gridOn, setGridOn] = useState(true);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;
    sg.addBody('grid-box', 'Box', createBoxMeshData(2, 1, 1.5), {
      position: [0, 0.5, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.fitAll();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <button
          type="button"
          style={gridOn ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={() => {
            sgRef.current?.toggleGrid();
            setGridOn((v) => !v);
          }}
        >
          Grid: {gridOn ? 'ON' : 'OFF'}
        </button>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} gridVisible={true} />
    </div>
  );
}

export const Grid: Story = {
  render: () => <GridShowcase />,
};

// ---------------------------------------------------------------------------
// CADQuality — composite showcase
// ---------------------------------------------------------------------------

function CADQualityShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const pickingRef = useRef<PickingManager | null>(null);
  const [_selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // Mock assembly: base plate + vertical column + cross-beam + fastener spheres
    sg.addBody('base', 'Base Plate', createBoxMeshData(6, 0.3, 4), {
      position: [0, 0.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('column', 'Column', createCylinderMeshData(0.4, 0.4, 3), {
      position: [-2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('beam', 'Cross Beam', createBoxMeshData(4, 0.4, 0.6), {
      position: [0, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('column2', 'Column 2', createCylinderMeshData(0.4, 0.4, 3), {
      position: [2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('fastener1', 'Fastener 1', createSphereMeshData(0.2), {
      position: [-2, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('fastener2', 'Fastener 2', createSphereMeshData(0.2), {
      position: [2, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('bushing', 'Bushing', createTorusMeshData(0.5, 0.12), {
      position: [0, 0.42, 1.2],
      rotation: [0, 0, 0, 1],
    });

    sg.fitAll();

    // Wire up selection
    const picking = new PickingManager(
      sg.scene,
      sg,
      (entityId, modifiers) => {
        setSelectedIds((prev) => {
          let next: Set<string>;
          if (entityId == null) {
            next = new Set();
          } else if (modifiers.ctrl) {
            next = new Set(prev);
            if (next.has(entityId)) {
              next.delete(entityId);
            } else {
              next.add(entityId);
            }
          } else {
            next = new Set([entityId]);
          }
          sg.applySelection(next);
          return next;
        });
      },
      (entityId) => {
        sg.applyHover(entityId);
      },
    );
    pickingRef.current = picking;
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>CAD Quality Composite — all rendering primitives active</span>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} gridVisible={false} ssaoEnabled={false} />
    </div>
  );
}

export const CADQuality: Story = {
  render: () => <CADQualityShowcase />,
};

// ---------------------------------------------------------------------------
// ShadowGround story — showcases shadow-catching ground plane
// ---------------------------------------------------------------------------

function ShadowGroundShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // Assembly positioned above y=0 to show contact shadows
    sg.addBody('sg-base', 'Base Plate', createBoxMeshData(6, 0.3, 4), {
      position: [0, 0.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sg-column', 'Column', createCylinderMeshData(0.4, 0.4, 3), {
      position: [-2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sg-beam', 'Cross Beam', createBoxMeshData(4, 0.4, 0.6), {
      position: [0, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sg-column2', 'Column 2', createCylinderMeshData(0.4, 0.4, 3), {
      position: [2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sg-sphere', 'Floating Sphere', createSphereMeshData(0.5), {
      position: [0, 1.5, 1.5],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('sg-torus', 'Bushing', createTorusMeshData(0.5, 0.12), {
      position: [0, 0.42, -1.2],
      rotation: [0, 0, 0, 1],
    });

    sg.fitAll();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>Shadow Ground — BackgroundMaterial shadowOnly mode</span>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <Viewport onSceneReady={handleSceneReady} gridVisible={false} ssaoEnabled={false} />
    </div>
  );
}

export const ShadowGround: Story = {
  render: () => <ShadowGroundShowcase />,
};

// Keep old Picking story as alias for backward compat
export const Picking: Story = {
  render: () => <SelectionShowcase />,
};

// ---------------------------------------------------------------------------
// RenderingDebug — runtime toggles for AA, AO, materials, background
// ---------------------------------------------------------------------------

function RenderingDebugShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const sceneRef = useRef<{
    defaultPipeline: import('@babylonjs/core').DefaultRenderingPipeline;
    ssaoPipeline: import('@babylonjs/core').SSAO2RenderingPipeline;
    scene: import('@babylonjs/core').Scene;
    camera: import('@babylonjs/core').ArcRotateCamera;
  } | null>(null);
  const [ssao, setSsao] = useState(false);
  const [aaMode, setAAMode] = useState<'msaa+fxaa' | 'fxaa-only' | 'none'>('msaa+fxaa');
  const [info, setInfo] = useState('');

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // Build the same assembly as CADQuality
    sg.addBody('base', 'Base Plate', createBoxMeshData(6, 0.3, 4), {
      position: [0, 0.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('column', 'Column', createCylinderMeshData(0.4, 0.4, 3), {
      position: [-2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('beam', 'Cross Beam', createBoxMeshData(4, 0.4, 0.6), {
      position: [0, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('column2', 'Column 2', createCylinderMeshData(0.4, 0.4, 3), {
      position: [2, 1.65, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('fastener1', 'Fastener 1', createSphereMeshData(0.2), {
      position: [-2, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('fastener2', 'Fastener 2', createSphereMeshData(0.2), {
      position: [2, 3.15, 0],
      rotation: [0, 0, 0, 1],
    });
    sg.addBody('bushing', 'Bushing', createTorusMeshData(0.5, 0.12), {
      position: [0, 0.42, 1.2],
      rotation: [0, 0, 0, 1],
    });
    sg.fitAll();

    // Grab pipeline references for runtime toggling
    const scene = sg.scene;
    const pipelines = scene.postProcessRenderPipelineManager;
    const defaultPipeline = pipelines.supportedPipelines.find(
      (p) => p.name === 'default_pipeline',
    ) as import('@babylonjs/core').DefaultRenderingPipeline | undefined;
    const ssaoPipeline = pipelines.supportedPipelines.find((p) => p.name === 'ssao_pipeline') as
      | import('@babylonjs/core').SSAO2RenderingPipeline
      | undefined;

    if (defaultPipeline && ssaoPipeline) {
      const camera = scene.activeCamera as import('@babylonjs/core').ArcRotateCamera;
      sceneRef.current = { defaultPipeline, ssaoPipeline, scene, camera };

      const engine = scene.getEngine();
      const dpr = window.devicePixelRatio ?? 1;
      const canvas = engine.getRenderingCanvas();
      setInfo(
        `Engine: ${engine.name} | DPR: ${dpr.toFixed(1)} | ` +
          `Canvas: ${canvas?.width ?? '?'}x${canvas?.height ?? '?'} | ` +
          `MSAA: ${defaultPipeline.samples} | FXAA: ${defaultPipeline.fxaaEnabled}`,
      );
    }
  }, []);

  const toggleAA = () => {
    const refs = sceneRef.current;
    if (!refs) return;
    let next: 'msaa+fxaa' | 'fxaa-only' | 'none';
    if (aaMode === 'msaa+fxaa') next = 'fxaa-only';
    else if (aaMode === 'fxaa-only') next = 'none';
    else next = 'msaa+fxaa';
    setAAMode(next);

    switch (next) {
      case 'msaa+fxaa':
        refs.defaultPipeline.samples = 4;
        refs.defaultPipeline.fxaaEnabled = true;
        break;
      case 'fxaa-only':
        refs.defaultPipeline.samples = 1;
        refs.defaultPipeline.fxaaEnabled = true;
        break;
      case 'none':
        refs.defaultPipeline.samples = 1;
        refs.defaultPipeline.fxaaEnabled = false;
        break;
    }

    setInfo((prev) =>
      prev
        .replace(/MSAA: \d+/, `MSAA: ${refs.defaultPipeline.samples}`)
        .replace(/FXAA: \w+/, `FXAA: ${refs.defaultPipeline.fxaaEnabled}`),
    );
  };

  const toggleSSAO = () => {
    const refs = sceneRef.current;
    if (!refs) return;
    const next = !ssao;
    setSsao(next);
    if (next) {
      refs.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        'ssao_pipeline',
        refs.camera,
      );
    } else {
      refs.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
        'ssao_pipeline',
        refs.camera,
      );
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <button type="button" style={BUTTON_STYLE} onClick={toggleAA}>
          AA: {aaMode}
        </button>
        <button
          type="button"
          style={ssao ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={toggleSSAO}
        >
          SSAO: {ssao ? 'ON' : 'OFF'}
        </button>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            style={BUTTON_STYLE}
            onClick={() => sgRef.current?.setCameraPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      {info && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            ...STATUS_STYLE,
            maxWidth: 600,
            fontSize: 10,
          }}
        >
          {info}
        </div>
      )}
      <Viewport onSceneReady={handleSceneReady} ssaoEnabled={ssao} />
    </div>
  );
}

export const RenderingDebug: Story = {
  render: () => <RenderingDebugShowcase />,
};
