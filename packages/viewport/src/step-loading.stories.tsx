import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type { SceneGraphManager, ViewportTheme } from './index.js';
import { Viewport } from './index.js';
import { loadSTEP } from './loaders/step-loader.js';
import {
  ACTIVE_BUTTON_STYLE,
  BUTTON_STYLE,
  CAMERA_PRESETS,
  STATUS_STYLE,
  TOOLBAR_STYLE,
} from './story-helpers.js';

const meta: Meta<typeof Viewport> = {
  title: 'Viewport/STEP Loading',
  component: Viewport,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// STEP Assembly scene
// ---------------------------------------------------------------------------

function StepAssemblyScene({ theme = 'dark' }: { theme: ViewportTheme }) {
  const sgRef = useRef<SceneGraphManager | null>(null);
  const [status, setStatus] = useState('Waiting for scene...');
  const [stats, setStats] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSceneReady = useCallback((sg: SceneGraphManager) => {
    sgRef.current = sg;
    setStatus('Initializing OCCT WASM...');

    loadSTEP('/0003834589_asm.stp')
      .then((result) => {
        let totalFaces = 0;
        let totalTris = 0;
        let totalVerts = 0;

        for (let i = 0; i < result.bodies.length; i++) {
          const body = result.bodies[i];
          const id = `body-${i}`;

          sg.addBody(
            id,
            body.name,
            body.mesh,
            {
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
            },
            body.partIndex,
          );

          totalFaces += body.partIndex.length;
          totalTris += body.mesh.indices.length / 3;
          totalVerts += body.mesh.vertices.length / 3;
        }

        setStatus(`${result.rootName}: ${result.bodies.length} bodies loaded`);
        setStats(
          `${totalFaces.toLocaleString()} faces, ` +
            `${totalTris.toLocaleString()} tris, ` +
            `${totalVerts.toLocaleString()} verts`,
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
        {stats && <span style={STATUS_STYLE}>{stats}</span>}
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

export const Assembly: Story = {
  name: 'Multi-Body Assembly (STEP)',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return <StepAssemblyScene theme={theme} />;
  },
};
