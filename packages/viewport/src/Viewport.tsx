import { ArcRotateCamera, Camera, Engine, Scene, Vector3 } from '@babylonjs/core';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { useEffect, useRef } from 'react';

import {
  type HoverCallback,
  type InteractionMode,
  type PickCallback,
  PickingManager,
} from './picking.js';
import {
  setupEnvironment,
  createLightingRig,
  createMaterialFactory,
  createGrid,
  createPostProcessing,
  createSelectionVisuals,
} from './rendering/index.js';
import { SceneGraphManager } from './scene-graph.js';

export interface ViewportProps {
  className?: string;
  onSceneReady?: (sceneGraph: SceneGraphManager) => void;
  onPick?: PickCallback;
  onHover?: HoverCallback;
  interactionMode?: InteractionMode;
  gridVisible?: boolean;
  ssaoEnabled?: boolean;
  /** Rendering preset. Currently only 'cadNeutralStudio' is available. */
  preset?: 'cadNeutralStudio';
}

/**
 * Core engineering viewport — Babylon.js scene bootstrapping with
 * CAD-quality rendering pipeline.
 *
 * This component owns the canvas, engine, and scene lifecycle.
 * Simulation transforms will be applied imperatively to scene nodes,
 * bypassing React re-renders on the hot path.
 */
export function Viewport({
  className,
  onSceneReady,
  onPick,
  onHover,
  interactionMode = 'select',
  gridVisible = false,
  ssaoEnabled = false,
  preset: _preset = 'cadNeutralStudio',
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const pickingManagerRef = useRef<PickingManager | null>(null);

  useEffect(() => {
    pickingManagerRef.current?.setInteractionMode(interactionMode);
  }, [interactionMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    (async () => {
      let engine: Engine;

      // Skip WebGPU on Firefox — its implementation has a lower
      // max_inter_stage_shader_variables limit (15) that breaks SSAO2+sharpen
      const isFirefox = /Firefox\//i.test(navigator.userAgent);
      if (navigator.gpu && !isFirefox) {
        try {
          const webgpu = new WebGPUEngine(canvas, {
            antialias: true,
            adaptToDeviceRatio: true,
          });
          await webgpu.initAsync();
          if (disposed) {
            webgpu.dispose();
            return;
          }
          engine = webgpu as unknown as Engine;
        } catch {
          if (disposed) return;
          engine = new Engine(canvas, true, { preserveDrawingBuffer: true, antialias: true }, true);
        }
      } else {
        engine = new Engine(canvas, true, { preserveDrawingBuffer: true, antialias: true }, true);
      }

      // Cap DPR at 2 to avoid excessive pixel count on 3x+ displays
      const maxDPR = 2;
      const dpr = Math.min(window.devicePixelRatio ?? 1, maxDPR);
      engine.setHardwareScalingLevel(1 / dpr);

      if (disposed) {
        engine.dispose();
        return;
      }

      engineRef.current = engine;

      const scene = new Scene(engine);

      // Default engineering camera — orthographic for CAD
      const camera = new ArcRotateCamera(
        'camera',
        Math.PI / 4,
        Math.PI / 3,
        10,
        Vector3.Zero(),
        scene,
      );
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

      // Initialize ortho bounds based on canvas aspect ratio
      const aspect = canvas.width / canvas.height || 1;
      const orthoHalfSize = 5;
      camera.orthoLeft = -orthoHalfSize * aspect;
      camera.orthoRight = orthoHalfSize * aspect;
      camera.orthoTop = orthoHalfSize;
      camera.orthoBottom = -orthoHalfSize;

      camera.attachControl(canvas, true);
      camera.wheelPrecision = 50;

      // In ortho mode the camera position is arbitrary — objects can be
      // "behind" the camera plane yet still visible. Use a negative minZ
      // so nothing gets near-plane clipped.
      camera.minZ = -1000;
      camera.maxZ = 1000;

      // Sync orthographic bounds to camera radius on every frame so
      // mouse-wheel zoom works naturally in ortho mode.
      const orthoZoomObserver = scene.onBeforeRenderObservable.add(() => {
        const aspect = engine.getAspectRatio(camera) || 1;
        const halfSize = camera.radius * 0.5;
        camera.orthoLeft = -halfSize * aspect;
        camera.orthoRight = halfSize * aspect;
        camera.orthoTop = halfSize;
        camera.orthoBottom = -halfSize;
      });

      // 1. Environment (clear color + IBL)
      const env = setupEnvironment(scene);

      // 2. Lighting (3-point rig)
      const lightingRig = createLightingRig(scene);

      // 3. Materials (PBR factory)
      const materialFactory = createMaterialFactory(scene);

      // 4. Grid (off by default)
      const grid = createGrid(scene, { visible: gridVisible });

      // 5. Selection visuals (edge outlines + material tinting)
      const selectionVisuals = createSelectionVisuals(scene, materialFactory);

      // 6. Scene graph (inject deps)
      const sceneGraph = new SceneGraphManager(scene, camera, {
        materialFactory,
        lightingRig,
        selectionVisuals,
        grid,
      });

      // 7. Post-processing (after camera is attached)
      const postProcessing = createPostProcessing(scene, camera, { ssaoEnabled });

      // 8. Picking manager
      let pickingManager: PickingManager | undefined;
      if (onPick || onHover) {
        pickingManager = new PickingManager(
          scene,
          sceneGraph,
          onPick ?? (() => {}),
          onHover ?? (() => {}),
        );
        pickingManager.setInteractionMode(interactionMode);
        pickingManagerRef.current = pickingManager;
      }

      onSceneReady?.(sceneGraph);

      engine.runRenderLoop(() => {
        scene.render();
      });

      const handleResize = () => engine.resize();
      window.addEventListener('resize', handleResize);

      // Stash cleanup references on the canvas for the teardown closure
      (canvas as unknown as Record<string, unknown>).__cleanup = () => {
        window.removeEventListener('resize', handleResize);
        scene.onBeforeRenderObservable.remove(orthoZoomObserver);
        pickingManager?.dispose();
        pickingManagerRef.current = null;
        sceneGraph.dispose();
        postProcessing.dispose();
        selectionVisuals.dispose();
        grid.dispose();
        lightingRig.dispose();
        materialFactory.dispose();
        env.dispose();
        engine.dispose();
        engineRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      const cleanupFn = (canvas as unknown as Record<string, unknown>).__cleanup as
        | (() => void)
        | undefined;
      if (cleanupFn) {
        cleanupFn();
        (canvas as unknown as Record<string, unknown>).__cleanup = undefined;
      } else if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
