import {
  type AbstractMesh,
  Color3,
  DirectionalLight,
  HemisphericLight,
  type Scene,
  ShadowGenerator,
  Vector3,
} from '@babylonjs/core';

export interface LightingRigOptions {
  shadowMapSize?: number;
  shadowsEnabled?: boolean;
}

export interface LightingRig {
  keyLight: DirectionalLight;
  fillLight: DirectionalLight;
  rimLight: DirectionalLight;
  ambientLight: HemisphericLight;
  shadowGenerator: ShadowGenerator;
  addShadowCaster: (mesh: AbstractMesh) => void;
  removeShadowCaster: (mesh: AbstractMesh) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Professional 3-point lighting rig with soft PCF shadows on the key light.
 */
export function createLightingRig(
  scene: Scene,
  options?: LightingRigOptions,
): LightingRig {
  const shadowMapSize = options?.shadowMapSize ?? 2048;
  const shadowsEnabled = options?.shadowsEnabled ?? true;

  // Key light — pure white, primary shadow caster
  const keyLight = new DirectionalLight(
    'key_light',
    new Vector3(-1, -2, 1).normalize(),
    scene,
  );
  keyLight.intensity = 1.2;
  keyLight.diffuse = Color3.White();
  keyLight.specular = Color3.White();

  // Fill light — pure white, softer
  const fillLight = new DirectionalLight(
    'fill_light',
    new Vector3(1, -1, -0.5).normalize(),
    scene,
  );
  fillLight.intensity = 0.45;
  fillLight.diffuse = Color3.White();
  fillLight.specular = Color3.White();

  // Rim light — accent from behind
  const rimLight = new DirectionalLight(
    'rim_light',
    new Vector3(0.2, -0.5, -1).normalize(),
    scene,
  );
  rimLight.intensity = 0.25;
  rimLight.diffuse = Color3.White();
  rimLight.specular = Color3.White();

  // Ambient fill — prevents pure-black shadows
  const ambientLight = new HemisphericLight(
    'ambient_light',
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.2;
  ambientLight.diffuse = Color3.White();
  ambientLight.groundColor = new Color3(0.3, 0.3, 0.3);

  // Shadow generator on key light — soft PCF
  const shadowGenerator = new ShadowGenerator(shadowMapSize, keyLight);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.bias = 0.001;
  shadowGenerator.normalBias = 0.02;

  if (!shadowsEnabled) {
    keyLight.shadowEnabled = false;
  }

  return {
    keyLight,
    fillLight,
    rimLight,
    ambientLight,
    shadowGenerator,

    addShadowCaster(mesh: AbstractMesh) {
      shadowGenerator.addShadowCaster(mesh);
    },

    removeShadowCaster(mesh: AbstractMesh) {
      shadowGenerator.removeShadowCaster(mesh);
    },

    setShadowsEnabled(enabled: boolean) {
      keyLight.shadowEnabled = enabled;
    },

    dispose() {
      shadowGenerator.dispose();
      keyLight.dispose();
      fillLight.dispose();
      rimLight.dispose();
      ambientLight.dispose();
    },
  };
}
