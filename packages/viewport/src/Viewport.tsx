import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { useEffect, useRef } from 'react';

export interface ViewportProps {
  className?: string;
}

/**
 * Core engineering viewport — Babylon.js scene bootstrapping.
 *
 * This component owns the canvas, engine, and scene lifecycle.
 * Simulation transforms will be applied imperatively to scene nodes,
 * bypassing React re-renders on the hot path.
 */
export function Viewport({ className }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
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

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
