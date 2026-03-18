export { setupEnvironment, type EnvironmentOptions, type EnvironmentSetup } from './environment.js';
export { createLightingRig, type LightingRig, type LightingRigOptions } from './lighting.js';
export { createMaterialFactory, type MaterialFactory, type MaterialPreset } from './materials.js';
export { createGrid, type GridOverlay, type GridOptions } from './grid.js';
export { createPostProcessing, type PostProcessingPipeline, type PostProcessingOptions } from './post-processing.js';
export { createSelectionVisuals, type SelectionVisuals } from './selection.js';
export { CAD_NEUTRAL_STUDIO, type ViewportPreset } from './presets.js';
export { createDatumTriad } from './datum-triad.js';
export {
  createRevoluteJointVisual,
  createPrismaticJointVisual,
  createFixedJointVisual,
} from './joint-visuals.js';
