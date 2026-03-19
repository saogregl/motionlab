import {
  Color4,
  CubeTexture,
  DynamicTexture,
  EXRCubeTexture,
  HDRCubeTexture,
  Layer,
  type Scene,
} from '@babylonjs/core';

export interface EnvironmentOptions {
  clearColor?: Color4;
  environmentIntensity?: number;
  /**
   * URL to an HDR environment file for IBL reflections.
   * Supports .env (prefiltered), .hdr (Radiance RGBE), and .exr (OpenEXR).
   * Falls back to procedural if not provided or load fails.
   */
  hdrUrl?: string;
  backgroundGradient?: boolean;
  backgroundTopColor?: [number, number, number];
  backgroundBottomColor?: [number, number, number];
}

export interface EnvironmentSetup {
  dispose: () => void;
}

/**
 * Configures the scene background and IBL environment for PBR reflections.
 */
export function setupEnvironment(
  scene: Scene,
  options?: EnvironmentOptions,
): EnvironmentSetup {
  const clearColor = options?.clearColor ?? new Color4(0.941, 0.945, 0.949, 1.0);
  const envIntensity = options?.environmentIntensity ?? 1.2;
  const useGradient = options?.backgroundGradient ?? true;
  const topColor = options?.backgroundTopColor ?? [0.722, 0.722, 0.737];
  const bottomColor = options?.backgroundBottomColor ?? [0.816, 0.816, 0.816];

  scene.clearColor = clearColor;

  // --- Background gradient layer ---
  let bgLayer: Layer | null = null;
  let gradientTex: DynamicTexture | null = null;

  if (useGradient) {
    gradientTex = new DynamicTexture('bg_gradient', { width: 1, height: 256 }, scene);
    const ctx = gradientTex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    const topHex = rgbToHex(topColor[0], topColor[1], topColor[2]);
    const bottomHex = rgbToHex(bottomColor[0], bottomColor[1], bottomColor[2]);
    grad.addColorStop(0, topHex);
    grad.addColorStop(1, bottomHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);
    gradientTex.update();

    bgLayer = new Layer('bg_layer', null, scene, true);
    bgLayer.texture = gradientTex;
  }

  // --- IBL environment ---
  let envHelper: ReturnType<Scene['createDefaultEnvironment']> = null;

  if (options?.hdrUrl) {
    try {
      const url = options.hdrUrl;
      const ext = url.split('.').pop()?.toLowerCase();

      if (ext === 'exr') {
        // EXR: prefilter on-the-fly into cube texture (requires WebGL2+)
        const exrTexture = new EXRCubeTexture(url, scene, 256, false, true, true);
        scene.environmentTexture = exrTexture;
      } else if (ext === 'hdr') {
        // HDR (Radiance RGBE): prefilter on-the-fly
        const hdrTexture = new HDRCubeTexture(url, scene, 256, false, true, false, true);
        scene.environmentTexture = hdrTexture;
      } else {
        // .env: already prefiltered
        const envTexture = CubeTexture.CreateFromPrefilteredData(url, scene);
        scene.environmentTexture = envTexture;
      }

      scene.environmentIntensity = envIntensity;
    } catch (e) {
      console.warn('[viewport] Failed to load HDR environment, falling back to procedural:', e);
      envHelper = createProceduralEnvironment(scene, envIntensity);
    }
  } else {
    envHelper = createProceduralEnvironment(scene, envIntensity);
  }

  return {
    dispose: () => {
      scene.environmentTexture?.dispose();
      envHelper?.dispose();
      bgLayer?.dispose();
      gradientTex?.dispose();
    },
  };
}

function createProceduralEnvironment(
  scene: Scene,
  envIntensity: number,
): ReturnType<Scene['createDefaultEnvironment']> {
  const envHelper = scene.createDefaultEnvironment({
    createSkybox: false,
    createGround: false,
    setupImageProcessing: false,
  });

  if (scene.environmentTexture) {
    scene.environmentIntensity = envIntensity;
  }

  return envHelper;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v * 255)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
