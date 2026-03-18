import type { MaterialPreset } from './materials.js';

/**
 * Aggregated rendering parameters for a viewport visual style.
 * Data-only — no Babylon imports. Values are passed to the existing
 * rendering setup functions.
 */
export interface ViewportPreset {
  readonly name: string;

  // Environment
  readonly clearColor: [number, number, number, number];
  readonly environmentIntensity: number;

  // Lighting
  readonly keyLightIntensity: number;
  readonly fillLightIntensity: number;
  readonly rimLightIntensity: number;
  readonly ambientIntensity: number;
  readonly ambientGroundColor: [number, number, number];

  // Default material
  readonly defaultMaterial: MaterialPreset;

  // Post-processing
  readonly msaaSamples: number;
  readonly fxaaEnabled: boolean;
  readonly exposure: number;
  readonly contrast: number;
  readonly ssaoRadius: number;
  readonly ssaoStrength: number;
}

/**
 * Studio preset with ACES filmic tone mapping, moderate metallic default
 * material, and strong key light for defined shadows and specular highlights.
 */
export const CAD_NEUTRAL_STUDIO: ViewportPreset = {
  name: 'cadNeutralStudio',

  clearColor: [0.941, 0.945, 0.949, 1.0],
  environmentIntensity: 0.8,

  keyLightIntensity: 1.2,
  fillLightIntensity: 0.45,
  rimLightIntensity: 0.25,
  ambientIntensity: 0.2,
  ambientGroundColor: [0.3, 0.3, 0.3],

  defaultMaterial: 'cad-default',

  msaaSamples: 4,
  fxaaEnabled: true,
  exposure: 1.1,
  contrast: 1.0,
  ssaoRadius: 1.2,
  ssaoStrength: 0.25,
};
