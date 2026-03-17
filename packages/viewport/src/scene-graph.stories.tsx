import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type { SceneGraphManager, CameraPreset } from './scene-graph.js';
import { Viewport } from './Viewport.js';

/**
 * Generate a simple box mesh (8 vertices, 12 triangles) for demo purposes.
 */
function createBoxMeshData(sx = 1, sy = 1, sz = 1) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;

  // prettier-ignore
  const positions = [
    // Front face
    -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
    // Back face
    -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
    // Top face
    -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
    // Bottom face
    -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
    // Right face
     hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
    // Left face
    -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
  ];

  // prettier-ignore
  const normals = [
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
   -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];

  // prettier-ignore
  // Babylon.js is left-handed: front faces need clockwise winding when viewed from outside
  const indices = [
     0,  2,  1,   0,  3,  2,  // front
     4,  6,  5,   4,  7,  6,  // back
     8, 10,  9,   8, 11, 10,  // top
    12, 14, 13,  12, 15, 14,  // bottom
    16, 18, 17,  16, 19, 18,  // right
    20, 22, 21,  20, 23, 22,  // left
  ];

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
  };
}

const CAMERA_PRESETS: CameraPreset[] = [
  'isometric', 'fit-all', 'front', 'back', 'left', 'right', 'top', 'bottom',
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

function SceneGraphShowcase() {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [bodyCount, setBodyCount] = useState(0);
  const nextId = useRef(0);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    // Add an initial body at the origin
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

const meta: Meta = {
  title: 'Viewport/SceneGraph',
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Showcase: Story = {
  render: () => <SceneGraphShowcase />,
};
