import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type {
  FaceHoverCallback,
  InteractionMode,
  SceneGraphManager,
  ViewportTheme,
} from './index.js';
import { Viewport } from './index.js';
import { loadSTEP } from './loaders/step-loader.js';
import {
  ACTIVE_BUTTON_STYLE,
  BUTTON_STYLE,
  CAMERA_PRESETS,
  STATUS_STYLE,
  TOOLBAR_STYLE,
  createBoxMeshDataWithTopology,
  createCylinderMeshDataWithTopology,
  createSphereMeshDataWithTopology,
  createTorusMeshDataWithTopology,
} from './story-helpers.js';

const meta: Meta<typeof Viewport> = {
  title: 'Viewport/Face Selection',
  component: Viewport,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Face info display
// ---------------------------------------------------------------------------

const FACE_INFO_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  padding: '6px 12px',
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  background: 'rgba(30,30,46,0.9)',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 6,
  zIndex: 10,
};

// ---------------------------------------------------------------------------
// Story A: Procedural face highlighting
// ---------------------------------------------------------------------------

function ProceduralFaceScene({ theme = 'dark' }: { theme: ViewportTheme }) {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [faceInfo, setFaceInfo] = useState<string | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    const box = createBoxMeshDataWithTopology(1.2, 1.2, 1.2);
    sg.addBody('box', 'Box', box, {
      position: [-2, 0.6, 0],
      rotation: [0, 0, 0, 1],
    }, box.partIndex);

    const cyl = createCylinderMeshDataWithTopology(0.5, 0.5, 1.5, 48);
    sg.addBody('cylinder', 'Cylinder', cyl, {
      position: [0, 0.75, 0],
      rotation: [0, 0, 0, 1],
    }, cyl.partIndex);

    const sph = createSphereMeshDataWithTopology(0.7, 48, 32);
    sg.addBody('sphere', 'Sphere', sph, {
      position: [2, 0.7, 0],
      rotation: [0, 0, 0, 1],
    }, sph.partIndex);

    const tor = createTorusMeshDataWithTopology(0.6, 0.2, 48, 24);
    sg.addBody('torus', 'Torus', tor, {
      position: [4, 0.6, 0],
      rotation: [0, 0, 0, 1],
    }, tor.partIndex);

    sg.fitAll();
  }, []);

  const handlePick = useCallback((entityId: string | null) => {
    const sg = sgRef.current;
    if (!sg) return;
    sg.applySelection(entityId ? new Set([entityId]) : new Set());
    sg.applyHover(null);
  }, []);

  const handleHover = useCallback((entityId: string | null) => {
    sgRef.current?.applyHover(entityId);
  }, []);

  const handleFaceHover: FaceHoverCallback = useCallback((face) => {
    if (face) {
      const typeLabel = face.previewType ?? 'unknown';
      setFaceInfo(`Body: ${face.bodyId} | Face: ${face.faceIndex} | Type: ${typeLabel}`);
    } else {
      setFaceInfo(null);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'select' ? 'create-datum' : 'select'));
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>Face Selection (Procedural)</span>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        <button
          type="button"
          style={mode === 'create-datum' ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={toggleMode}
        >
          {mode === 'create-datum' ? 'Create Datum Mode' : 'Select Mode'}
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
        <button
          type="button"
          style={BUTTON_STYLE}
          onClick={() => sgRef.current?.fitAll()}
        >
          fit-all
        </button>
        <button
          type="button"
          style={BUTTON_STYLE}
          onClick={() => sgRef.current?.toggleGrid()}
        >
          grid
        </button>
      </div>

      {faceInfo && <div style={FACE_INFO_STYLE}>{faceInfo}</div>}

      <Viewport
        onSceneReady={handleSceneReady}
        onPick={handlePick}
        onHover={handleHover}
        onFaceHover={handleFaceHover}
        interactionMode={mode}
        gridVisible
        theme={theme}
      />
    </div>
  );
}

export const Procedural: Story = {
  name: 'Face Highlighting (Procedural)',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return <ProceduralFaceScene theme={theme} />;
  },
};

// ---------------------------------------------------------------------------
// Story B: STEP face highlighting
// ---------------------------------------------------------------------------

function StepFaceScene({ theme = 'dark' }: { theme: ViewportTheme }) {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [status, setStatus] = useState('Waiting for scene...');
  const [faceInfo, setFaceInfo] = useState<string | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;
    setStatus('Initializing OCCT WASM...');

    loadSTEP('/0003834589_asm.stp')
      .then((result) => {
        let totalFaces = 0;
        for (let i = 0; i < result.bodies.length; i++) {
          const body = result.bodies[i];
          sg.addBody(`body-${i}`, body.name, body.mesh, {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
          }, body.partIndex);
          totalFaces += body.partIndex.length;
        }
        setStatus(
          `${result.bodies.length} bodies, ${totalFaces} faces`,
        );
        sg.fitAll();
      })
      .catch((err) => {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  const handlePick = useCallback((entityId: string | null) => {
    const sg = sgRef.current;
    if (!sg) return;
    sg.applySelection(entityId ? new Set([entityId]) : new Set());
    sg.applyHover(null);
  }, []);

  const handleHover = useCallback((entityId: string | null) => {
    sgRef.current?.applyHover(entityId);
  }, []);

  const handleFaceHover: FaceHoverCallback = useCallback((face) => {
    if (face) {
      const typeLabel = face.previewType ?? 'unknown';
      setFaceInfo(`Body: ${face.bodyId} | Face: ${face.faceIndex} | Type: ${typeLabel}`);
    } else {
      setFaceInfo(null);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'select' ? 'create-datum' : 'select'));
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>{status}</span>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        <button
          type="button"
          style={mode === 'create-datum' ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={toggleMode}
        >
          {mode === 'create-datum' ? 'Create Datum Mode' : 'Select Mode'}
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
        <button
          type="button"
          style={BUTTON_STYLE}
          onClick={() => sgRef.current?.fitAll()}
        >
          fit-all
        </button>
        <button
          type="button"
          style={BUTTON_STYLE}
          onClick={() => sgRef.current?.toggleGrid()}
        >
          grid
        </button>
      </div>

      {faceInfo && <div style={FACE_INFO_STYLE}>{faceInfo}</div>}

      <Viewport
        onSceneReady={handleSceneReady}
        onPick={handlePick}
        onHover={handleHover}
        onFaceHover={handleFaceHover}
        interactionMode={mode}
        gridVisible
        theme={theme}
      />
    </div>
  );
}

export const StepFile: Story = {
  name: 'Face Highlighting (STEP)',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return <StepFaceScene theme={theme} />;
  },
};
