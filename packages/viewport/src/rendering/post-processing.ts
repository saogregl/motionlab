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
}

export interface PostProcessingPipeline {
  defaultPipeline: DefaultRenderingPipeline;
  ssaoPipeline: SSAO2RenderingPipeline;
  setSsaoEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Anti-aliasing (MSAA + FXAA), neutral tone mapping, and subtle SSAO.
 */
export function createPostProcessing(
  scene: Scene,
  camera: ArcRotateCamera,
  options?: PostProcessingOptions,
): PostProcessingPipeline {
  const ssaoEnabled = options?.ssaoEnabled ?? true;
  const msaaSamples = options?.msaaSamples ?? 4;

  // DefaultRenderingPipeline — AA + tone mapping
  const defaultPipeline = new DefaultRenderingPipeline(
    'default_pipeline',
    true, // HDR
    scene,
    [camera],
  );
  defaultPipeline.samples = msaaSamples;
  defaultPipeline.fxaaEnabled = true;
  defaultPipeline.imageProcessing.toneMappingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  defaultPipeline.bloomEnabled = false;

  // SSAO2 — subtle ambient occlusion
  const ssaoPipeline = new SSAO2RenderingPipeline(
    'ssao_pipeline',
    scene,
    { ssaoRatio: 0.5, blurRatio: 0.5 },
    [camera],
    false, // forceGeometryBuffer
  );
  ssaoPipeline.radius = 2.0;
  ssaoPipeline.totalStrength = 0.5;
  ssaoPipeline.samples = 16;
  ssaoPipeline.maxZ = 250;

  if (!ssaoEnabled) {
    scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
      'ssao_pipeline',
      camera,
    );
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

    dispose() {
      defaultPipeline.dispose();
      ssaoPipeline.dispose();
    },
  };
}
