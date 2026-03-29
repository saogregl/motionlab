import { useViewportInsets } from '@motionlab/ui';
import {
  Bounds,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
  useBounds,
} from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { ACESFilmicToneMapping, DoubleSide, Object3D, OrthographicCamera } from 'three';

import {
  type FaceHoverCallback,
  type HoverCallback,
  type InteractionMode,
  type PickCallback,
  PickingManager,
  type SpatialPickData,
} from './picking-three.js';
import { createMaterialFactory } from './rendering/materials-three.js';
import { VIEWPORT_THEMES } from './rendering/viewport-theme.js';
import { SceneGraphManager } from './scene-graph-three.js';

const DEFAULT_R3F_EVENT_LAYER = 0;

export type { FaceHoverCallback, HoverCallback, InteractionMode, PickCallback, SpatialPickData };

export type ViewportTheme = 'light' | 'dark';

export interface ViewportProps {
  className?: string;
  onSceneReady?: (sceneGraph: SceneGraphManager) => void;
  onPick?: PickCallback;
  onHover?: HoverCallback;
  onFaceHover?: FaceHoverCallback;
  interactionMode?: InteractionMode;
  gridVisible?: boolean;
  /** Controls viewport background. Defaults to 'dark'. */
  theme?: ViewportTheme;
}

type SceneSetupProps = Omit<ViewportProps, 'className'>;

// Theme colors are defined in rendering/viewport-theme.ts
// and kept in sync with CSS tokens in globals.css.

function GizmoBridge({
  sceneGraph,
  revision,
  onDragStart,
  onDragEnd,
}: {
  sceneGraph: SceneGraphManager | null;
  revision: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [target, setTarget] = useState<Object3D | null>(null);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  const [space, setSpace] = useState<'local' | 'world'>('world');
  const [snap, setSnap] = useState({ translationSnap: 0.01, rotationSnap: Math.PI / 12 });
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!sceneGraph) {
      setTarget(null);
      return;
    }

    const nextTarget = sceneGraph.getGizmoTargetObject();
    setTarget(nextTarget);
    setMode(sceneGraph.getGizmoMode() === 'rotate' ? 'rotate' : 'translate');
    setSnap(sceneGraph.getGizmoSnap());
    setSpace(sceneGraph.getGizmoSpace());
  }, [sceneGraph, revision]);

  if (!sceneGraph || !target || sceneGraph.getGizmoMode() === 'off') {
    return null;
  }

  return (
    <TransformControls
      object={target}
      mode={mode}
      space={space}
      translationSnap={shiftHeld ? snap.translationSnap : null}
      rotationSnap={shiftHeld ? snap.rotationSnap : null}
      onMouseDown={() => {
        onDragStart?.();
      }}
      onObjectChange={() => {
        sceneGraph.notifyGizmoObjectChanged();
      }}
      onMouseUp={() => {
        onDragEnd?.();
        sceneGraph.notifyGizmoDragEnd();
      }}
    />
  );
}

function GizmoLayout({ theme }: { theme: ViewportTheme }) {
  const insets = useViewportInsets();
  return (
    <GizmoHelper alignment="bottom-right" margin={[72 + insets.right, 72 + insets.bottom]}>
      <GizmoViewport axisColors={VIEWPORT_THEMES[theme].axisColors} labelColor="white" />
    </GizmoHelper>
  );
}

function SceneSetup({
  onSceneReady,
  onPick,
  onHover,
  onFaceHover,
  interactionMode,
  gridVisible = true,
  theme = 'dark',
}: SceneSetupProps) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const raycaster = useThree((s) => s.raycaster);

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

  // R3F v9's invalidate() handles its own RAF scheduling and deduplication.
  // Calling it directly is safe and avoids the race condition that the old
  // requestAnimationFrame wrapper introduced with v9's self-managing loop.
  const requestRender = () => {
    invalidate();
  };

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    scene.background = VIEWPORT_THEMES[theme].background.clone();
    raycaster.layers.set(DEFAULT_R3F_EVENT_LAYER);

    const materialFactory = createMaterialFactory();
    const sceneGraph = new SceneGraphManager(scene, camera as OrthographicCamera, {
      materialFactory,
      requestRender,
    });
    sceneGraph.setCanvasSize(size.width, size.height);
    sceneGraph.onGizmoStateChanged = () => {
      setGizmoRevision((value) => value + 1);
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
  }, [camera, gl, raycaster, scene]);

  useEffect(() => {
    sceneGraphRef.current?.setCanvasSize(size.width, size.height);
    requestRender();
  }, [size.height, size.width]);

  useEffect(() => {
    scene.background = VIEWPORT_THEMES[theme].background.clone();
    requestRender();
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
      {/* IBL environment map — drives PBR reflections & indirect light */}
      <Environment files="/textures/studio_small_03_1k.hdr" environmentIntensity={0.6} />

      {/* Direct lighting rig: key + fill + soft ambient */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[200, 300, 400]} intensity={1.0} />
      <directionalLight position={[-150, 80, 200]} intensity={0.5} />

      {/* Infinite anti-aliased grid with fade */}
      {showGrid && (
        <Grid
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          cellColor={VIEWPORT_THEMES[theme].gridCellColor}
          sectionColor={VIEWPORT_THEMES[theme].gridSectionColor}
          fadeDistance={25}
          fadeStrength={1.2}
          cellThickness={0.6}
          sectionThickness={1.0}
          side={DoubleSide}
          position={[0, -0.001, 0]}
        />
      )}

      {/* Orientation gizmo — click to snap camera */}
      <GizmoLayout theme={theme} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        onChange={(e) => {
          if (e?.target) {
            sceneGraphRef.current?.setOrbitTarget(e.target.target);
          }
        }}
        onStart={() => {
          pickingRef.current?.setOrbitDragging(true);
        }}
        onEnd={() => {
          pickingRef.current?.setOrbitDragging(false);
        }}
      />
      {/* drei Bounds — provides camera-fitting API to SceneGraphManager */}
      <Bounds observe margin={1.6} maxDuration={0}>
        <BoundsBridge sceneGraph={sceneGraphState} />
      </Bounds>
      <GizmoBridge
        sceneGraph={sceneGraphState}
        revision={gizmoRevision}
        onDragStart={() => {
          pickingRef.current?.setTransformDragging(true);
        }}
        onDragEnd={() => {
          pickingRef.current?.setTransformDragging(false);
        }}
      />
      <DofAnimator sceneGraph={sceneGraphState} />
    </>
  );
}

/** Bridges drei Bounds API into the imperative SceneGraphManager. */
function BoundsBridge({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const bounds = useBounds();
  useEffect(() => {
    sceneGraph?.setBoundsApi(bounds);
    return () => {
      sceneGraph?.setBoundsApi(null);
    };
  }, [sceneGraph, bounds]);
  return null;
}

/** Drives DOF indicator oscillation animation. Only invalidates when indicators are active. */
function DofAnimator({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  useFrame(({ clock, invalidate: inv }) => {
    if (!sceneGraph || !sceneGraph.hasDofAnimations()) return;
    sceneGraph.updateDofAnimations(clock.elapsedTime);
    inv();
  });
  return null;
}

export function Viewport({
  className,
  onSceneReady,
  onPick,
  onHover,
  onFaceHover,
  interactionMode,
  gridVisible,
  theme = 'dark',
}: ViewportProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        orthographic
        camera={{ position: [5, 5, 5], zoom: 50, near: -1000, far: 1000 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        shadows={false}
      >
        <SceneSetup
          onSceneReady={onSceneReady}
          onPick={onPick}
          onHover={onHover}
          onFaceHover={onFaceHover}
          interactionMode={interactionMode}
          gridVisible={gridVisible}
          theme={theme}
        />
      </Canvas>
    </div>
  );
}
