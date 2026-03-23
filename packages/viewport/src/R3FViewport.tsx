import { Canvas, useThree } from '@react-three/fiber';
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from '@react-three/drei';

import { useEffect, useRef, useState } from 'react';
import { ACESFilmicToneMapping, Color, Object3D, OrthographicCamera } from 'three';

import {
  PickingManager,
  type FaceHoverCallback,
  type HoverCallback,
  type InteractionMode,
  type PickCallback,
  type SpatialPickData,
} from './picking-three.js';
import { createMaterialFactory } from './rendering/materials-three.js';
import { SceneGraphManager } from './scene-graph-three.js';

export type {
  FaceHoverCallback,
  HoverCallback,
  InteractionMode,
  PickCallback,
  SpatialPickData,
};

export type ViewportTheme = 'light' | 'dark';

export interface ViewportProps {
  className?: string;
  onSceneReady?: (sceneGraph: SceneGraphManager) => void;
  onPick?: PickCallback;
  onHover?: HoverCallback;
  onFaceHover?: FaceHoverCallback;
  interactionMode?: InteractionMode;
  gridVisible?: boolean;
  ssaoEnabled?: boolean;
  preset?: 'cadNeutralStudio';
  /** Controls viewport background. Defaults to 'dark'. */
  theme?: ViewportTheme;
}

interface SceneSetupProps extends Omit<ViewportProps, 'className'> {}

const THEME_BACKGROUNDS: Record<ViewportTheme, string> = {
  light: '#ffffff',
  dark: '#161616', // g100
};

function GizmoBridge({
  sceneGraph,
  revision,
}: {
  sceneGraph: SceneGraphManager | null;
  revision: number;
}) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');

  useEffect(() => {
    if (!sceneGraph) {
      setTarget(null);
      return;
    }

    const nextTarget = sceneGraph.getGizmoTargetObject();
    setTarget(nextTarget);
    setMode(sceneGraph.getGizmoMode() === 'rotate' ? 'rotate' : 'translate');
  }, [sceneGraph, revision]);

  if (!sceneGraph || !target || sceneGraph.getGizmoMode() === 'off') {
    return null;
  }

  return (
    <TransformControls
      object={target}
      mode={mode}
      onObjectChange={() => {
        sceneGraph.notifyGizmoObjectChanged();
      }}
      onMouseUp={() => {
        sceneGraph.notifyGizmoDragEnd();
      }}
    />
  );
}

function SceneSetup({
  onSceneReady,
  onPick,
  onHover,
  onFaceHover,
  interactionMode,
  gridVisible = false,
  ssaoEnabled = false,
  theme = 'dark',
}: SceneSetupProps) {
  const { scene, camera, gl, size } = useThree();

  const sceneGraphRef = useRef<SceneGraphManager | null>(null);
  const pickingRef = useRef<PickingManager | null>(null);
  const [sceneGraphState, setSceneGraphState] = useState<SceneGraphManager | null>(null);
  const [gizmoRevision, setGizmoRevision] = useState(0);
  const [showGrid, setShowGrid] = useState(gridVisible);

  const onSceneReadyRef = useRef(onSceneReady);
  const onPickRef = useRef(onPick);
  const onHoverRef = useRef(onHover);
  const onFaceHoverRef = useRef(onFaceHover);
  onSceneReadyRef.current = onSceneReady;
  onPickRef.current = onPick;
  onHoverRef.current = onHover;
  onFaceHoverRef.current = onFaceHover;

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    scene.background = new Color(THEME_BACKGROUNDS[theme]);

    const materialFactory = createMaterialFactory(scene);
    const sceneGraph = new SceneGraphManager(scene, camera as OrthographicCamera, {
      materialFactory,
    });
    sceneGraph.setCanvasSize(size.width, size.height);
    sceneGraph.onGizmoStateChanged = () => {
      setGizmoRevision((value) => value + 1);
    };

    // Bridge grid toggle from imperative SceneGraphManager to React state
    const originalToggleGrid = sceneGraph.toggleGrid.bind(sceneGraph);
    sceneGraph.toggleGrid = () => {
      originalToggleGrid();
      setShowGrid(sceneGraph.gridVisible);
    };

    sceneGraphRef.current = sceneGraph;
    setSceneGraphState(sceneGraph);

    const picking = new PickingManager(
      gl,
      camera,
      scene,
      sceneGraph,
      (entityId, modifiers, spatial) => {
        onPickRef.current?.(entityId, modifiers, spatial);
      },
      (entityId) => {
        onHoverRef.current?.(entityId);
      },
    );
    pickingRef.current = picking;
    picking.setOnFaceHoverChange((face) => {
      onFaceHoverRef.current?.(face);
    });
    picking.setInteractionMode(interactionMode ?? 'select');

    onSceneReadyRef.current?.(sceneGraph);

    return () => {
      picking.dispose();
      sceneGraph.dispose();
      materialFactory.dispose();
      pickingRef.current = null;
      sceneGraphRef.current = null;
      setSceneGraphState(null);
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    sceneGraphRef.current?.setCanvasSize(size.width, size.height);
  }, [size.height, size.width]);

  useEffect(() => {
    scene.background = new Color(THEME_BACKGROUNDS[theme]);
  }, [scene, theme]);

  useEffect(() => {
    if (!pickingRef.current) return;
    pickingRef.current.setInteractionMode(interactionMode ?? 'select');
    pickingRef.current.setOnFaceHoverChange((face) => {
      onFaceHoverRef.current?.(face);
    });
  }, [interactionMode, onFaceHover]);

  useEffect(() => {
    if (gridVisible === undefined) return;
    setShowGrid(gridVisible);
  }, [gridVisible]);

  return (
    <>
      {/* 3-point lighting rig */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[200, 300, 400]} intensity={0.8} />
      <directionalLight position={[-150, 80, 200]} intensity={0.4} />

      {/* IBL environment for PBR reflections — no visible background */}
      <Environment preset="studio" background={false} />

      {/* Infinite anti-aliased grid with fade */}
      {showGrid && (
        <Grid
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          cellColor="#303038"
          sectionColor="#454555"
          fadeDistance={25}
          fadeStrength={1.2}
          cellThickness={0.6}
          sectionThickness={1.0}
          position={[0, -0.001, 0]}
        />
      )}

      {/* Orientation gizmo — click to snap camera */}
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport
          axisColors={['#ff4060', '#40df80', '#4080ff']}
          labelColor="white"
        />
      </GizmoHelper>

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <GizmoBridge sceneGraph={sceneGraphState} revision={gizmoRevision} />
    </>
  );
}

export function Viewport({
  className,
  onSceneReady,
  onPick,
  onHover,
  onFaceHover,
  interactionMode,
  gridVisible,
  ssaoEnabled,
  preset,
  theme = 'dark',
}: ViewportProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        orthographic
        camera={{ position: [5, 5, 5], zoom: 50, near: -1000, far: 1000 }}
        dpr={[1, 1.5]}
        shadows={false}
      >
        <SceneSetup
          onSceneReady={onSceneReady}
          onPick={onPick}
          onHover={onHover}
          onFaceHover={onFaceHover}
          interactionMode={interactionMode}
          gridVisible={gridVisible}
          ssaoEnabled={ssaoEnabled}
          preset={preset}
          theme={theme}
        />
      </Canvas>
    </div>
  );
}
