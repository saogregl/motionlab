import {
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
 * reflections, and an invisible ground plane for shadow reception.
 */
export function setupEnvironment(
  scene: Scene,
  options?: EnvironmentOptions,
): EnvironmentSetup {
  const clearColor = options?.clearColor ?? new Color4(0.878, 0.878, 0.878, 1.0);
  const envIntensity = options?.environmentIntensity ?? 0.7;
  const groundSize = options?.groundSize ?? 200;

  // Neutral gray background matching --bg-viewport: #e0e0e0
  scene.clearColor = clearColor;

  // Procedural IBL environment for PBR reflections (no skybox, no visible ground)
  const envHelper = scene.createDefaultEnvironment({
    createSkybox: false,
    createGround: false,
  });

  if (scene.environmentTexture) {
    scene.environmentIntensity = envIntensity;
  }

  // Invisible ground plane for shadow reception
  const groundPlane = MeshBuilder.CreateGround(
    'shadow_ground',
    { width: groundSize, height: groundSize },
    scene,
  );
  groundPlane.visibility = 0;
  groundPlane.receiveShadows = true;
  groundPlane.isPickable = false;

  return {
    groundPlane,
    dispose: () => {
      groundPlane.dispose();
      envHelper?.dispose();
    },
  };
}
