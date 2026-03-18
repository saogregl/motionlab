import {
  BackgroundMaterial,
  Color3,
  Color4,
  MeshBuilder,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

export interface EnvironmentOptions {
  clearColor?: Color4;
  environmentIntensity?: number;
  groundSize?: number;
}

export interface EnvironmentSetup {
  groundPlane: Mesh;
  dispose: () => void;
}

/**
 * Configures the scene background, procedural IBL environment for PBR
 * reflections, and a shadow-catching ground plane for contact grounding.
 */
export function setupEnvironment(
  scene: Scene,
  options?: EnvironmentOptions,
): EnvironmentSetup {
  const clearColor = options?.clearColor ?? new Color4(0.941, 0.945, 0.949, 1.0);
  const envIntensity = options?.environmentIntensity ?? 0.8;
  const groundSize = options?.groundSize ?? 200;

  // Neutral gray background matching --bg-viewport: #e0e0e0
  scene.clearColor = clearColor;

  // Procedural IBL environment for PBR reflections (no skybox, no visible ground).
  // setupImageProcessing: false prevents the EnvironmentHelper from overriding
  // scene image processing with ACES tone mapping and warm contrast/exposure
  // defaults — our DefaultRenderingPipeline handles all image processing.
  const envHelper = scene.createDefaultEnvironment({
    createSkybox: false,
    createGround: false,
    setupImageProcessing: false,
  });

  if (scene.environmentTexture) {
    scene.environmentIntensity = envIntensity;
  }

  // Shadow-catching ground plane using BackgroundMaterial (shadowOnly mode).
  // Renders only where shadows fall, transparent elsewhere — equivalent to
  // Three.js's shadowMaterial for subtle contact grounding.
  const groundMat = new BackgroundMaterial('shadow_ground_mat', scene);
  groundMat.shadowOnly = true;
  groundMat.primaryColor = Color3.White();

  const groundPlane = MeshBuilder.CreateGround(
    'shadow_ground',
    { width: groundSize, height: groundSize },
    scene,
  );
  groundPlane.material = groundMat;
  groundPlane.visibility = 1;
  groundPlane.receiveShadows = true;
  groundPlane.isPickable = false;

  return {
    groundPlane,
    dispose: () => {
      groundMat.dispose();
      groundPlane.dispose();
      envHelper?.dispose();
    },
  };
}
