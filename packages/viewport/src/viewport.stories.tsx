import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type { SceneGraphManager, ViewportTheme } from './index.js';
import { Viewport } from './index.js';
import {
  ACTIVE_BUTTON_STYLE,
  BUTTON_STYLE,
  CAMERA_PRESETS,
  createBoxMeshData,
  createCylinderMeshData,
  createSphereMeshData,
  createTorusMeshData,
  STATUS_STYLE,
  TOOLBAR_STYLE,
} from './story-helpers.js';

const meta: Meta<typeof Viewport> = {
  title: 'Viewport',
  component: Viewport,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Shared shell with camera toolbar, click-to-select, and hover
// ---------------------------------------------------------------------------

function SceneShell({
  onSceneReady,
  title,
  extra,
  gridVisible,
  theme = 'dark',
}: {
  onSceneReady: (sceneGraph: SceneGraphManager) => void;
  title: string;
  extra?: React.ReactNode;
  gridVisible?: boolean;
  theme?: ViewportTheme;
}) {
  const sgRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback(
    (sceneGraph: SceneGraphManager) => {
      sgRef.current = sceneGraph;
      onSceneReady(sceneGraph);
    },
    [onSceneReady],
  );

  const handlePick = useCallback((entityId: string | null) => {
    if (!sgRef.current) return;
    if (entityId) {
      sgRef.current.applySelection(new Set([entityId]));
    } else {
      sgRef.current.applySelection(new Set());
    }
    sgRef.current.applyHover(null);
  }, []);

  const handleHover = useCallback((entityId: string | null) => {
    sgRef.current?.applyHover(entityId);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={TOOLBAR_STYLE}>
        <span style={STATUS_STYLE}>{title}</span>
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
        {extra}
      </div>
      <Viewport
        onSceneReady={handleSceneReady}
        onPick={handlePick}
        onHover={handleHover}
        gridVisible={gridVisible}
        theme={theme}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FACE_COUNT_6 = new Uint32Array([2, 2, 2, 2, 2, 2]);

function addPillar(sg: SceneGraphManager, id: string, x: number, z: number) {
  sg.addBody(
    id,
    id,
    createCylinderMeshData(0.2, 0.2, 1.4, 16),
    { position: [x, 0.7, z], rotation: [0, 0, 0, 1] },
    FACE_COUNT_6,
  );
}

function addPlatform(sg: SceneGraphManager, id: string, y: number) {
  sg.addBody(
    id,
    id,
    createBoxMeshData(3, 0.15, 2),
    { position: [0, y, 0], rotation: [0, 0, 0, 1] },
    FACE_COUNT_6,
  );
}

// ---------------------------------------------------------------------------
// Story: Assembly Overview
// ---------------------------------------------------------------------------

export const AssemblyOverview: Story = {
  name: 'Assembly Overview',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return (
      <SceneShell
        title="Bodies, datums, joint, and load"
        gridVisible
        theme={theme}
        onSceneReady={(sg) => {
          sg.addBody(
            'base',
            'Base',
            createBoxMeshData(4, 0.4, 3),
            {
              position: [0, 0.2, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addBody(
            'arm',
            'Arm',
            createCylinderMeshData(0.35, 0.35, 2.6, 24),
            {
              position: [0, 1.7, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addBody(
            'knob',
            'Knob',
            createSphereMeshData(0.45),
            {
              position: [1.5, 1.1, 0.5],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addBody(
            'ring',
            'Ring',
            createTorusMeshData(0.55, 0.14),
            {
              position: [-1.6, 0.95, -0.6],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addDatum('d-base', 'base', { position: [0.9, 0.2, 0], rotation: [0, 0, 0, 1] });
          sg.addDatum('d-arm', 'arm', { position: [0, 1.2, 0], rotation: [0, 0, 0, 1] });
          sg.addDatum('d-knob', 'knob', { position: [0, 0, 0], rotation: [0, 0, 0, 1] });

          sg.addJoint('j-1', 'd-base', 'd-arm', 'revolute');

          sg.addLoadVisual('load-1', {
            type: 'point-force',
            datumId: 'd-knob',
            vector: { x: 0, y: 1.25, z: 0 },
          });

          sg.fitAll();
        }}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Joint Type Gallery
// ---------------------------------------------------------------------------

const JOINT_TYPES = [
  'revolute',
  'prismatic',
  'fixed',
  'spherical',
  'cylindrical',
  'planar',
] as const;

export const JointTypeGallery: Story = {
  name: 'Joint Type Gallery',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeMode, setActiveMode] = useState<'hover' | 'select' | null>(null);
    const sgRef = useRef<SceneGraphManager | null>(null);

    const applyState = useCallback((id: string | null, mode: 'hover' | 'select' | null) => {
      const sg = sgRef.current;
      if (!sg) return;
      sg.applySelection(new Set(mode === 'select' && id ? [id] : []));
      sg.applyHover(mode === 'hover' ? id : null);
    }, []);

    const extra = (
      <>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {JOINT_TYPES.map((jt) => (
          <span key={jt} style={{ display: 'inline-flex', gap: 2 }}>
            <button
              type="button"
              style={
                activeId === `j-${jt}` && activeMode === 'hover'
                  ? ACTIVE_BUTTON_STYLE
                  : BUTTON_STYLE
              }
              onClick={() => {
                const id = `j-${jt}`;
                const mode = 'hover';
                setActiveId(id);
                setActiveMode(mode);
                applyState(id, mode);
              }}
            >
              {jt} hover
            </button>
            <button
              type="button"
              style={
                activeId === `j-${jt}` && activeMode === 'select'
                  ? ACTIVE_BUTTON_STYLE
                  : BUTTON_STYLE
              }
              onClick={() => {
                const id = `j-${jt}`;
                const mode = 'select';
                setActiveId(id);
                setActiveMode(mode);
                applyState(id, mode);
              }}
            >
              sel
            </button>
          </span>
        ))}
        <button
          type="button"
          style={activeId === null ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
          onClick={() => {
            setActiveId(null);
            setActiveMode(null);
            applyState(null, null);
          }}
        >
          clear
        </button>
      </>
    );

    return (
      <SceneShell
        title="All 6 joint types — hover/select to see states"
        gridVisible
        theme={theme}
        extra={extra}
        onSceneReady={(sg) => {
          sgRef.current = sg;
          const spacing = 2.2;
          const startX = -((JOINT_TYPES.length - 1) * spacing) / 2;

          for (let i = 0; i < JOINT_TYPES.length; i++) {
            const jt = JOINT_TYPES[i];
            const x = startX + i * spacing;

            // Parent body (bottom box)
            sg.addBody(
              `parent-${jt}`,
              `Parent ${jt}`,
              createBoxMeshData(1, 0.5, 1),
              { position: [x, 0.25, 0], rotation: [0, 0, 0, 1] },
              FACE_COUNT_6,
            );

            // Child body (top cylinder)
            sg.addBody(
              `child-${jt}`,
              `Child ${jt}`,
              createCylinderMeshData(0.3, 0.3, 0.8, 16),
              { position: [x, 1.3, 0], rotation: [0, 0, 0, 1] },
              FACE_COUNT_6,
            );

            // Parent datum on top face of box
            sg.addDatum(`dp-${jt}`, `parent-${jt}`, {
              position: [x, 0.5, 0],
              rotation: [0, 0, 0, 1],
            });

            // Child datum on bottom of cylinder
            sg.addDatum(`dc-${jt}`, `child-${jt}`, {
              position: [x, 0.9, 0],
              rotation: [0, 0, 0, 1],
            });

            // Joint connecting them
            sg.addJoint(`j-${jt}`, `dp-${jt}`, `dc-${jt}`, jt);
          }

          sg.fitAll();
        }}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Joint States (revolute with limits)
// ---------------------------------------------------------------------------

export const JointStates: Story = {
  name: 'Joint States',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    const [mode, setMode] = useState<'idle' | 'hover' | 'selected'>('idle');
    const sgRef = useRef<SceneGraphManager | null>(null);

    const applyMode = useCallback((sg: SceneGraphManager, m: typeof mode) => {
      switch (m) {
        case 'hover':
          sg.applySelection(new Set());
          sg.applyHover('j-rev');
          break;
        case 'selected':
          sg.applySelection(new Set(['j-rev']));
          sg.applyHover(null);
          break;
        default:
          sg.applySelection(new Set());
          sg.applyHover(null);
      }
    }, []);

    const handlePick = useCallback((entityId: string | null) => {
      if (!sgRef.current) return;
      if (entityId) {
        sgRef.current.applySelection(new Set([entityId]));
        sgRef.current.applyHover(null);
        setMode('selected');
      } else {
        sgRef.current.applySelection(new Set());
        setMode('idle');
      }
    }, []);

    const handleHover = useCallback((entityId: string | null) => {
      sgRef.current?.applyHover(entityId);
    }, []);

    const extra = (
      <>
        <span style={{ ...BUTTON_STYLE, cursor: 'default', opacity: 0.6 }}>|</span>
        {(['idle', 'hover', 'selected'] as const).map((m) => (
          <button
            type="button"
            key={m}
            style={mode === m ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
            onClick={() => {
              setMode(m);
              if (sgRef.current) applyMode(sgRef.current, m);
            }}
          >
            {m}
          </button>
        ))}
      </>
    );

    return (
      <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
        <div style={TOOLBAR_STYLE}>
          <span style={STATUS_STYLE}>
            Revolute joint — idle / hover / selected with ±70° limits
          </span>
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
          {extra}
        </div>
        <Viewport
          onSceneReady={(sg) => {
            sgRef.current = sg;

            sg.addBody(
              'base',
              'Base',
              createBoxMeshData(2, 0.4, 2),
              {
                position: [0, 0.2, 0],
                rotation: [0, 0, 0, 1],
              },
              FACE_COUNT_6,
            );

            sg.addBody(
              'arm',
              'Arm',
              createCylinderMeshData(0.25, 0.25, 1.6, 20),
              {
                position: [0, 1.2, 0],
                rotation: [0, 0, 0, 1],
              },
              FACE_COUNT_6,
            );

            sg.addDatum('d-base', 'base', { position: [0, 0.4, 0], rotation: [0, 0, 0, 1] });
            sg.addDatum('d-arm', 'arm', { position: [0, 0.4, 0], rotation: [0, 0, 0, 1] });

            sg.addJoint('j-rev', 'd-base', 'd-arm', 'revolute');
            // Set ±70° limits so the limit arc renders when selected
            sg.updateJointLimits('j-rev', -1.2, 1.2);

            applyMode(sg, mode);
            sg.fitAll();
          }}
          onPick={handlePick}
          onHover={handleHover}
          gridVisible
          theme={theme}
        />
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Datum Showcase
// ---------------------------------------------------------------------------

export const DatumShowcase: Story = {
  name: 'Datum Showcase',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return (
      <SceneShell
        title="RGB datum triads at various orientations"
        theme={theme}
        onSceneReady={(sg) => {
          // Large body to host datums
          sg.addBody(
            'block',
            'Block',
            createBoxMeshData(3, 2, 2),
            {
              position: [0, 1, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          // Datum at top face (identity orientation)
          sg.addDatum('d-top', 'block', {
            position: [0, 1, 0],
            rotation: [0, 0, 0, 1],
          });

          // Datum at right face (rotated 90 around Z)
          const sin45 = Math.sin(Math.PI / 4);
          const cos45 = Math.cos(Math.PI / 4);
          sg.addDatum('d-right', 'block', {
            position: [1.5, 0, 0],
            rotation: [0, 0, -sin45, cos45],
          });

          // Datum at front face (rotated 90 around X)
          sg.addDatum('d-front', 'block', {
            position: [0, 0, 1],
            rotation: [sin45, 0, 0, cos45],
          });

          // Datum at corner (tilted)
          sg.addDatum('d-corner', 'block', {
            position: [-1.2, 0.8, 0.7],
            rotation: [0.2, 0.3, 0.1, 0.93],
          });

          sg.fitAll();
        }}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Load Visuals
// ---------------------------------------------------------------------------

export const LoadVisuals: Story = {
  name: 'Load Visuals',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return (
      <SceneShell
        title="Point-force, point-torque, and spring-damper"
        gridVisible
        theme={theme}
        onSceneReady={(sg) => {
          // Two bodies with datums
          sg.addBody(
            'a',
            'Body A',
            createBoxMeshData(1.5, 1.5, 1.5),
            {
              position: [-2, 0.75, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addBody(
            'b',
            'Body B',
            createBoxMeshData(1.5, 1.5, 1.5),
            {
              position: [2, 0.75, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          sg.addDatum('da', 'a', { position: [0, 0.75, 0], rotation: [0, 0, 0, 1] });
          sg.addDatum('db', 'b', { position: [0, 0.75, 0], rotation: [0, 0, 0, 1] });
          sg.addDatum('da-side', 'a', { position: [0.75, 0, 0], rotation: [0, 0, 0, 1] });

          // Point force (upward)
          sg.addLoadVisual('force-1', {
            type: 'point-force',
            datumId: 'da',
            vector: { x: 0, y: 1.5, z: 0 },
          });

          // Point torque (around Y)
          sg.addLoadVisual('torque-1', {
            type: 'point-torque',
            datumId: 'db',
            vector: { x: 0, y: 1.0, z: 0 },
          });

          // Spring-damper between the two bodies
          sg.addLoadVisual('spring-1', {
            type: 'spring-damper',
            parentDatumId: 'da-side',
            childDatumId: 'db',
          });

          sg.fitAll();
        }}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Selection & Hover States
// ---------------------------------------------------------------------------

export const SelectionStates: Story = {
  name: 'Selection & Hover States',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    const [mode, setMode] = useState<'none' | 'select-box' | 'select-cyl' | 'hover-sphere'>(
      'select-box',
    );
    const sgRef = useRef<SceneGraphManager | null>(null);

    const applyMode = useCallback((sg: SceneGraphManager, m: typeof mode) => {
      switch (m) {
        case 'select-box':
          sg.applySelection(new Set(['box']));
          sg.applyHover(null);
          break;
        case 'select-cyl':
          sg.applySelection(new Set(['cyl']));
          sg.applyHover(null);
          break;
        case 'hover-sphere':
          sg.applySelection(new Set());
          sg.applyHover('sph');
          break;
        default:
          sg.applySelection(new Set());
          sg.applyHover(null);
      }
    }, []);

    const handlePick = useCallback((entityId: string | null) => {
      if (!sgRef.current) return;
      if (entityId) {
        sgRef.current.applySelection(new Set([entityId]));
      } else {
        sgRef.current.applySelection(new Set());
      }
      sgRef.current.applyHover(null);
      setMode('none');
    }, []);

    const handleHover = useCallback((entityId: string | null) => {
      sgRef.current?.applyHover(entityId);
    }, []);

    return (
      <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
        <div style={TOOLBAR_STYLE}>
          <span style={STATUS_STYLE}>Selection tint, hover emissive, and edge highlighting</span>
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
          {(
            [
              ['none', 'Clear'],
              ['select-box', 'Select Box'],
              ['select-cyl', 'Select Cylinder'],
              ['hover-sphere', 'Hover Sphere'],
            ] as const
          ).map(([m, label]) => (
            <button
              type="button"
              key={m}
              style={mode === m ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
              onClick={() => {
                setMode(m);
                if (sgRef.current) applyMode(sgRef.current, m);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <Viewport
          onSceneReady={(sceneGraph) => {
            sgRef.current = sceneGraph;

            sceneGraph.addBody(
              'box',
              'Box',
              createBoxMeshData(1.5, 1.5, 1.5),
              {
                position: [-2, 0.75, 0],
                rotation: [0, 0, 0, 1],
              },
              FACE_COUNT_6,
            );

            sceneGraph.addBody(
              'cyl',
              'Cylinder',
              createCylinderMeshData(0.5, 0.5, 2, 24),
              {
                position: [0, 1, 0],
                rotation: [0, 0, 0, 1],
              },
              FACE_COUNT_6,
            );

            sceneGraph.addBody(
              'sph',
              'Sphere',
              createSphereMeshData(0.7),
              {
                position: [2, 0.7, 0],
                rotation: [0, 0, 0, 1],
              },
              FACE_COUNT_6,
            );

            applyMode(sceneGraph, mode);
            sceneGraph.fitAll();
          }}
          onPick={handlePick}
          onHover={handleHover}
          gridVisible
          theme={theme}
        />
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Story: Camera Presets & Grid
// ---------------------------------------------------------------------------

export const CameraAndGrid: Story = {
  name: 'Camera & Grid',
  render: (_args, { globals }) => {
    const theme = (globals.theme ?? 'dark') as ViewportTheme;
    return (
      <SceneShell
        title="Camera presets and grid toggle — click fit-all repeatedly to verify no deformation"
        gridVisible
        theme={theme}
        onSceneReady={(sg) => {
          sg.addBody(
            'plate',
            'Plate',
            createBoxMeshData(6, 0.25, 4),
            {
              position: [0, 0.125, 0],
              rotation: [0, 0, 0, 1],
            },
            FACE_COUNT_6,
          );

          addPillar(sg, 'p1', -1.5, -0.5);
          addPillar(sg, 'p2', 1.5, -0.5);
          addPillar(sg, 'p3', -1.5, 0.5);
          addPillar(sg, 'p4', 1.5, 0.5);

          addPlatform(sg, 'shelf', 1.55);

          sg.fitAll();
        }}
      />
    );
  },
};
