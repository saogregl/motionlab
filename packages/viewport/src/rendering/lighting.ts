import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  type Scene,
  Vector3,
} from '@babylonjs/core';

export interface LightingRig {
  keyLight: DirectionalLight;
  fillLight: DirectionalLight;
  rimLight: DirectionalLight;
  ambientLight: HemisphericLight;
  dispose: () => void;
}

/**
 * Professional 3-point lighting rig for CAD viewport.
 */
export function createLightingRig(scene: Scene): LightingRig {
  // Key light — pure white, primary illumination
  const keyLight = new DirectionalLight(
    'key_light',
    new Vector3(-1, -2, 1).normalize(),
    scene,
  );
  keyLight.intensity = 0.9;
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

  // Ambient fill — provides even illumination from all directions.
  // groundColor lights faces pointing away from the hemisphere direction,
  // so a bright ground color prevents dark undersides on models.
  const ambientLight = new HemisphericLight(
    'ambient_light',
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.4;
  ambientLight.diffuse = Color3.White();
  ambientLight.groundColor = new Color3(0.8, 0.8, 0.85);

  return {
    keyLight,
    fillLight,
    rimLight,
    ambientLight,

    dispose() {
      keyLight.dispose();
      fillLight.dispose();
      rimLight.dispose();
      ambientLight.dispose();
    },
  };
}
