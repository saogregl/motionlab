import {
  type ArcRotateCamera,
  DefaultRenderingPipeline,
  type Scene,
  SSAO2RenderingPipeline,
} from '@babylonjs/core';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';

export interface PostProcessingOptions {
  ssaoEnabled?: boolean;
  msaaSamples?: number;
  exposure?: number;
  contrast?: number;
}

export interface PostProcessingPipeline {
  defaultPipeline: DefaultRenderingPipeline;
  ssaoPipeline: SSAO2RenderingPipeline;
  setSsaoEnabled: (enabled: boolean) => void;
  getAAState: () => { msaaSamples: number; fxaaEnabled: boolean; hdr: boolean };
  dispose: () => void;
}

/**
 * Anti-aliasing (MSAA + FXAA), ACES filmic tone mapping, and subtle SSAO.
 */
export function createPostProcessing(
  scene: Scene,
  camera: ArcRotateCamera,
  options?: PostProcessingOptions,
): PostProcessingPipeline {
  const ssaoEnabled = options?.ssaoEnabled ?? true;
  const msaaSamples = options?.msaaSamples ?? 4;
  const exposure = options?.exposure ?? 1.1;
  const contrast = options?.contrast ?? 1.0;

  // DefaultRenderingPipeline — AA + tone mapping + image processing
  const defaultPipeline = new DefaultRenderingPipeline(
    'default_pipeline',
    true, // HDR
    scene,
    [camera],
  );
  defaultPipeline.samples = msaaSamples;
  defaultPipeline.fxaaEnabled = true;
  defaultPipeline.imageProcessing.toneMappingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  defaultPipeline.imageProcessing.exposure = exposure;
  defaultPipeline.imageProcessing.contrast = contrast;
  defaultPipeline.bloomEnabled = false;

  // Mild sharpen pass for crisp edges
  defaultPipeline.sharpenEnabled = true;
  defaultPipeline.sharpen.edgeAmount = 0.15;
  defaultPipeline.sharpen.colorAmount = 1.0;

  if (defaultPipeline.samples !== msaaSamples) {
    console.warn(
      `[viewport] MSAA requested ${msaaSamples} samples but got ${defaultPipeline.samples}. Falling back to FXAA-only.`,
    );
  }

  // SSAO2 — subtle ambient occlusion
  const ssaoPipeline = new SSAO2RenderingPipeline(
    'ssao_pipeline',
    scene,
    { ssaoRatio: 0.75, blurRatio: 0.5 },
    [camera],
    false, // forceGeometryBuffer
  );
  ssaoPipeline.radius = 2.0;
  ssaoPipeline.totalStrength = 0.6;
  ssaoPipeline.samples = 24;
  ssaoPipeline.expensiveBlur = true;
  ssaoPipeline.maxZ = 250;

  if (!ssaoEnabled) {
    scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao_pipeline', camera);
  }

  return {
    defaultPipeline,
    ssaoPipeline,

    setSsaoEnabled(enabled: boolean) {
      if (enabled) {
        scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          'ssao_pipeline',
          camera,
        );
      } else {
        scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
          'ssao_pipeline',
          camera,
        );
      }
    },

    getAAState() {
      return {
        msaaSamples: defaultPipeline.samples,
        fxaaEnabled: defaultPipeline.fxaaEnabled,
        hdr: true,
      };
    },

    dispose() {
      defaultPipeline.dispose();
      ssaoPipeline.dispose();
    },
  };
}
