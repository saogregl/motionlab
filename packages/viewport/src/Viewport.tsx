import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { useEffect, useRef } from 'react';

import { SceneGraphManager } from './scene-graph.js';

export interface ViewportProps {
  className?: string;
  onSceneReady?: (sceneGraph: SceneGraphManager) => void;
}

/**
 * Core engineering viewport — Babylon.js scene bootstrapping.
 *
 * This component owns the canvas, engine, and scene lifecycle.
 * Simulation transforms will be applied imperatively to scene nodes,
 * bypassing React re-renders on the hot path.
 */
export function Viewport({ className, onSceneReady }: ViewportProps) {
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
          const webgpu = new WebGPUEngine(canvas);
          await webgpu.initAsync();
          if (disposed) {
            webgpu.dispose();
            return;
          }
          engine = webgpu as unknown as Engine;
        } catch {
          // TODO: WebGPU — fallback if Electron/browser rejects
          if (disposed) return;
          engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
        }
      } else {
        engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
      }

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

      // Basic lighting
      const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
      light.intensity = 0.9;

      // Scene graph manager — imperative body/entity management
      const sceneGraph = new SceneGraphManager(scene, camera);
      onSceneReady?.(sceneGraph);

      engine.runRenderLoop(() => {
        scene.render();
      });

      const handleResize = () => engine.resize();
      window.addEventListener('resize', handleResize);

      // Stash cleanup references on the canvas for the teardown closure
      (canvas as unknown as Record<string, unknown>).__cleanup = () => {
        window.removeEventListener('resize', handleResize);
        sceneGraph.dispose();
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
