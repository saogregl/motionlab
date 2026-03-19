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
  readonly backgroundGradient: boolean;
  readonly backgroundTopColor: [number, number, number];
  readonly backgroundBottomColor: [number, number, number];

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
  readonly ssaoSamples: number;
  readonly ssaoExpensiveBlur: boolean;
  readonly sharpenEnabled: boolean;
  readonly sharpenEdgeAmount: number;
}

/**
 * Studio preset with ACES filmic tone mapping, steel-blue default material,
 * 3-point lighting, and sharpen for CAD fidelity.
 */
export const CAD_NEUTRAL_STUDIO: ViewportPreset = {
  name: 'cadNeutralStudio',

  clearColor: [0.941, 0.945, 0.949, 1.0],
  environmentIntensity: 1.2,
  backgroundGradient: true,
  backgroundTopColor: [0.722, 0.722, 0.737],
  backgroundBottomColor: [0.816, 0.816, 0.816],

  keyLightIntensity: 0.9,
  fillLightIntensity: 0.45,
  rimLightIntensity: 0.25,
  ambientIntensity: 0.4,
  ambientGroundColor: [0.8, 0.8, 0.85],

  defaultMaterial: 'cad-default',

  msaaSamples: 4,
  fxaaEnabled: true,
  exposure: 1.1,
  contrast: 1.0,
  ssaoRadius: 2.0,
  ssaoStrength: 0.6,
  ssaoSamples: 24,
  ssaoExpensiveBlur: true,
  sharpenEnabled: true,
  sharpenEdgeAmount: 0.15,
};
