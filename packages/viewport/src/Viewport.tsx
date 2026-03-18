import { ArcRotateCamera, Engine, Scene, Vector3 } from '@babylonjs/core';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { useEffect, useRef } from 'react';

import { type HoverCallback, type PickCallback, PickingManager } from './picking.js';
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
  gridVisible?: boolean;
  shadowsEnabled?: boolean;
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
  gridVisible = false,
  shadowsEnabled = true,
  ssaoEnabled = true,
  preset: _preset = 'cadNeutralStudio',
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    (async () => {
      let engine: Engine;

      if (navigator.gpu) {
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

      // Default engineering camera
      const camera = new ArcRotateCamera(
        'camera',
        Math.PI / 4,
        Math.PI / 3,
        10,
        Vector3.Zero(),
        scene,
      );
      camera.attachControl(canvas, true);
      camera.wheelPrecision = 50;

      // 1. Environment (clear color + IBL)
      const env = setupEnvironment(scene);

      // 2. Lighting (3-point rig + shadows)
      const lightingRig = createLightingRig(scene, { shadowsEnabled });

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

      // Ground plane receives shadows
      env.groundPlane.receiveShadows = true;

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
        pickingManager?.dispose();
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
