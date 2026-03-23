import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type { SceneGraphManager, ViewportTheme } from './index.js';
import { Viewport } from './index.js';
import { loadSTL } from './loaders/stl-loader.js';
import {
  ACTIVE_BUTTON_STYLE,
  BUTTON_STYLE,
  CAMERA_PRESETS,
  STATUS_STYLE,
  TOOLBAR_STYLE,
} from './story-helpers.js';

const meta: Meta<typeof Viewport> = {
  title: 'Viewport/Kitchen Sink',
  component: Viewport,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

function HexapodScene({ theme = 'dark' }: { theme: ViewportTheme }) {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [status, setStatus] = useState('Waiting for scene...');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;
    setStatus('Loading hexapod.stl...');

    loadSTL('/hexapod.stl')
      .then((meshData) => {
        // Scale up and rotate Z-up → Y-up (-90° around X)
        const verts = meshData.vertices;
        const norms = meshData.normals;
        const scale = 1000;
        for (let i = 0; i < verts.length; i += 3) {
          const x = verts[i] * scale;
          const y = verts[i + 1] * scale;
          const z = verts[i + 2] * scale;
          verts[i] = x;
          verts[i + 1] = z;
          verts[i + 2] = -y;

          const nx = norms[i];
          const ny = norms[i + 1];
          const nz = norms[i + 2];
          norms[i] = nx;
          norms[i + 1] = nz;
          norms[i + 2] = -ny;
        }

        const vertCount = verts.length / 3;
        const triCount = meshData.indices.length / 3;
        setStatus(
          `Hexapod: ${vertCount.toLocaleString()} verts, ${triCount.toLocaleString()} tris`,
        );

        sg.addBody('hexapod', 'Hexapod', meshData, {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
        });

        // Datums at key locations
        sg.addDatum('d-top', 'hexapod', {
          position: [0, 1, 0],
          rotation: [0, 0, 0, 1],
        });
        sg.addDatum('d-front', 'hexapod', {
          position: [0, 0.5, 1],
          rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
        });

        // Force load
        sg.addLoadVisual('force-gravity', {
          type: 'point-force',
          datumId: 'd-top',
          vector: { x: 0, y: -2, z: 0 },
        });

        sg.fitAll();
      })
      .catch((err) => {
        setStatus(`Error loading STL: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  const handlePick = useCallback((entityId: string | null) => {
    const sg = sgRef.current;
    if (!sg) return;
    setSelectedId(entityId);
    sg.applySelection(entityId ? new Set([entityId]) : new Set());
    sg.applyHover(null);
  }, []);

  const handleHover = useCallback((entityId: string | null) => {
    sgRef.current?.applyHover(entityId);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>{status}</span>
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
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        <span style={STATUS_STYLE}>
          {selectedId ? `Selected: ${selectedId}` : 'Click to select'}
        </span>
        {selectedId && (
          <button
            type="button"
            style={ACTIVE_BUTTON_STYLE}
            onClick={() => {
              setSelectedId(null);
              sgRef.current?.applySelection(new Set());
            }}
          >
            Clear
          </button>
        )}
      </div>
      <Viewport
        onSceneReady={handleSceneReady}
        onPick={handlePick}
        onHover={handleHover}
        gridVisible
        theme={theme}
      />
    </div>
  );
}

export const Hexapod: Story = {
  name: 'Hexapod (STL)',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return <HexapodScene theme={theme} />;
  },
};
