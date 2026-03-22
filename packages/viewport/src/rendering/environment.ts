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
export function setupEnvironment(scene: Scene, options?: EnvironmentOptions): EnvironmentSetup {
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

  // --- IBL environment (required for PBR materials) ---
  // Use a bundled .env texture by default to avoid CSP issues with
  // Babylon's CDN URL (blocked by Electron's default-src 'self').
  const hdrUrl = options?.hdrUrl ?? '/textures/environmentSpecular.env';

  try {
    const ext = hdrUrl.split('.').pop()?.toLowerCase();

    if (ext === 'exr') {
      scene.environmentTexture = new EXRCubeTexture(hdrUrl, scene, 256, false, true, true);
    } else if (ext === 'hdr') {
      scene.environmentTexture = new HDRCubeTexture(hdrUrl, scene, 256, false, true, false, true);
    } else {
      scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(hdrUrl, scene);
    }
  } catch (e) {
    console.warn('[viewport] Failed to load environment texture:', e);
  }

  scene.environmentIntensity = envIntensity;

  return {
    dispose: () => {
      scene.environmentTexture?.dispose();
      bgLayer?.dispose();
      gradientTex?.dispose();
    },
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v * 255)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
