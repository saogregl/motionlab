import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type {
  FaceHoverCallback,
  InteractionMode,
  SceneGraphManager,
  SpatialPickData,
  ViewportTheme,
} from './index.js';
import { computeDatumLocalPose, Viewport } from './index.js';
import {
  ACTIVE_BUTTON_STYLE,
  BUTTON_STYLE,
  CAMERA_PRESETS,
  createBoxMeshDataWithTopology,
  createCylinderMeshDataWithTopology,
  createSphereMeshDataWithTopology,
  STATUS_STYLE,
  TOOLBAR_STYLE,
} from './story-helpers.js';

const meta: Meta<typeof Viewport> = {
  title: 'Viewport/Datum Creation',
  component: Viewport,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Styles
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

const DATUM_LIST_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 44,
  right: 12,
  padding: '8px 12px',
  fontSize: 11,
  fontFamily: 'system-ui, sans-serif',
  background: 'rgba(30,30,46,0.9)',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 6,
  zIndex: 10,
  maxHeight: 300,
  overflowY: 'auto',
  minWidth: 180,
};

// ---------------------------------------------------------------------------
// Datum creation scene
// ---------------------------------------------------------------------------

interface CreatedDatum {
  id: string;
  bodyId: string;
  faceIndex: number;
  surfaceType: string;
}

function DatumCreationScene({ theme = 'dark' }: { theme: ViewportTheme }) {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [mode, setMode] = useState<InteractionMode>('create-datum');
  const [faceInfo, setFaceInfo] = useState<string | null>(null);
  const [datums, setDatums] = useState<CreatedDatum[]>([]);
  const datumCountRef = useRef(0);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;

    const box = createBoxMeshDataWithTopology(1.5, 1.5, 1.5);
    sg.addBody(
      'box',
      'Box',
      box,
      {
        position: [-2.5, 0.75, 0],
        rotation: [0, 0, 0, 1],
      },
      box.partIndex,
    );

    const cyl = createCylinderMeshDataWithTopology(0.6, 0.6, 2, 48);
    sg.addBody(
      'cylinder',
      'Cylinder',
      cyl,
      {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1],
      },
      cyl.partIndex,
    );

    const sph = createSphereMeshDataWithTopology(0.8, 48, 32);
    sg.addBody(
      'sphere',
      'Sphere',
      sph,
      {
        position: [2.5, 0.8, 0],
        rotation: [0, 0, 0, 1],
      },
      sph.partIndex,
    );

    sg.fitAll();
  }, []);

  const handlePick = useCallback(
    (
      entityId: string | null,
      _modifiers: { ctrl: boolean; shift: boolean },
      spatial?: SpatialPickData,
    ) => {
      const sg = sgRef.current;
      if (!sg || !entityId || !spatial || mode !== 'create-datum') return;

      const localPose = computeDatumLocalPose(
        spatial.worldPoint,
        spatial.worldNormal,
        spatial.bodyWorldMatrix,
      );

      datumCountRef.current += 1;
      const datumId = `datum-${datumCountRef.current}`;

      sg.addDatum(datumId, entityId, {
        position: [localPose.position.x, localPose.position.y, localPose.position.z],
        rotation: [
          localPose.orientation.x,
          localPose.orientation.y,
          localPose.orientation.z,
          localPose.orientation.w,
        ],
      });

      const surfaceType =
        spatial.faceIndex !== undefined
          ? (faceInfo?.match(/Type: (\w+)/)?.[1] ?? 'unknown')
          : 'unknown';

      setDatums((prev) => [
        ...prev,
        {
          id: datumId,
          bodyId: entityId,
          faceIndex: spatial.faceIndex ?? -1,
          surfaceType,
        },
      ]);
    },
    [mode, faceInfo],
  );

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

  const clearDatums = useCallback(() => {
    const sg = sgRef.current;
    if (!sg) return;
    for (const datum of datums) {
      sg.removeDatum(datum.id);
    }
    setDatums([]);
  }, [datums]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>Datum Creation</span>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        <button
          type="button"
          style={mode === 'create-datum' ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={toggleMode}
        >
          {mode === 'create-datum' ? 'Create Datum Mode' : 'Select Mode'}
        </button>
        {datums.length > 0 && (
          <button type="button" style={{ ...BUTTON_STYLE, color: '#f38ba8' }} onClick={clearDatums}>
            Clear All ({datums.length})
          </button>
        )}
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
        <button type="button" style={BUTTON_STYLE} onClick={() => sgRef.current?.fitAll()}>
          fit-all
        </button>
        <button type="button" style={BUTTON_STYLE} onClick={() => sgRef.current?.toggleGrid()}>
          grid
        </button>
      </div>

      {faceInfo && <div style={FACE_INFO_STYLE}>{faceInfo}</div>}

      {datums.length > 0 && (
        <div style={DATUM_LIST_STYLE}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Created Datums ({datums.length})
          </div>
          {datums.map((d) => (
            <div key={d.id} style={{ padding: '2px 0', opacity: 0.85 }}>
              {d.id}: {d.bodyId} face {d.faceIndex} ({d.surfaceType})
            </div>
          ))}
        </div>
      )}

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

export const DatumFromFace: Story = {
  name: 'Geometry-Aware Datum Creation',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return <DatumCreationScene theme={theme} />;
  },
};
