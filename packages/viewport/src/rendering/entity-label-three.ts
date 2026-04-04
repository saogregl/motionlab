/// <reference path="../troika-three-text.d.ts" />

/**
 * Billboard text labels for entities in the viewport.
 *
 * Uses troika-three-text for GPU-accelerated SDF text rendering.
 * Billboard rotation is applied to a parent Group (not the Text mesh)
 * to avoid overwriting troika's internal onBeforeRender uniforms.
 */

import {
  Color,
  Group,
  MeshBasicMaterial,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { Text } from 'troika-three-text';

// ── Configuration ──

const FONT_SIZE = 0.018;
const FONT_URL = '/fonts/IBMPlexSans-Regular.ttf';
const LABEL_COLOR = new Color(0.85, 0.85, 0.85);
const LABEL_OPACITY = 0.85;
const LABEL_OFFSET_Y = 0.04; // offset above entity origin
const RENDER_ORDER = 20;

// ── Result interface ──

export interface EntityLabelResult {
  /** The root group — add to scene graph. */
  readonly textMesh: Group;
  /** Update the displayed text. */
  setText(value: string): void;
  /** Update offset above entity. */
  setOffset(y: number): void;
  /** Clean up GPU resources. */
  dispose(): void;
}

// ── Factory ──

export function createEntityLabel(
  text: string,
  opts?: {
    offsetY?: number;
    renderRequestCallback?: () => void;
  },
): EntityLabelResult {
  const renderRequest = opts?.renderRequestCallback;

  // Parent group handles billboard rotation so we don't
  // overwrite troika's internal onBeforeRender.
  const root = new Group();
  root.name = 'entity_label';
  root.renderOrder = RENDER_ORDER;
  root.userData = { isPickable: false };

  const offsetY = opts?.offsetY ?? LABEL_OFFSET_Y;
  root.position.y = offsetY;

  // Billboard: rotate the group to face the camera each frame
  root.onBeforeRender = (_renderer: WebGLRenderer, _scene: Scene, camera: Camera) => {
    root.quaternion.copy(camera.quaternion);
  };

  const textMesh = new Text();
  textMesh.font = FONT_URL;
  textMesh.text = text;
  textMesh.fontSize = FONT_SIZE;
  textMesh.color = LABEL_COLOR.getHex();
  textMesh.anchorX = 'center';
  textMesh.anchorY = 'bottom';
  textMesh.renderOrder = RENDER_ORDER;
  textMesh.userData = { isPickable: false };

  // Assign base material BEFORE sync — troika derives from this,
  // preserving transparent/depthTest/depthWrite settings.
  textMesh.material = new MeshBasicMaterial({
    transparent: true,
    opacity: LABEL_OPACITY,
    depthTest: false,
    depthWrite: false,
  });

  root.add(textMesh);

  // Kick off initial text generation; request render when atlas is ready.
  // Guard against non-browser environments (troika uses web workers via `self`).
  const safeSync = () => {
    if (typeof self !== 'undefined') {
      textMesh.sync(() => {
        renderRequest?.();
      });
    }
  };
  safeSync();

  return {
    textMesh: root,
    setText(value: string) {
      if (textMesh.text === value) return;
      textMesh.text = value;
      safeSync();
    },
    setOffset(y: number) {
      root.position.y = y;
    },
    dispose() {
      textMesh.dispose();
    },
  };
}
