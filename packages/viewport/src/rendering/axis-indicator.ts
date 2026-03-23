import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  Viewport,
} from '@babylonjs/core';

import { AXIS_INDICATOR_X, AXIS_INDICATOR_Y, AXIS_INDICATOR_Z } from './colors.js';
import type { SceneGraphManager } from '../scene-graph.js';

// ---------------------------------------------------------------------------
// Constants — drei-inspired vibrant palette (from colors.ts)
// ---------------------------------------------------------------------------

const AXES = [
  {
    name: 'X',
    color: '#ff2060',
    rgb: AXIS_INDICATOR_X,
    rotation: [0, 0, 0] as [number, number, number], // default: extends along +X
    headPos: new Vector3(1, 0, 0),
    negHeadPos: new Vector3(-1, 0, 0),
    alpha: 0,
    beta: Math.PI / 2,
    negAlpha: Math.PI,
    negBeta: Math.PI / 2,
  },
  {
    name: 'Y',
    color: '#20df80',
    rgb: AXIS_INDICATOR_Y,
    rotation: [0, 0, Math.PI / 2] as [number, number, number], // rotated to +Y
    headPos: new Vector3(0, 1, 0),
    negHeadPos: new Vector3(0, -1, 0),
    alpha: -Math.PI / 2,
    beta: 0.01,
    negAlpha: -Math.PI / 2,
    negBeta: Math.PI - 0.01,
  },
  {
    name: 'Z',
    color: '#2080ff',
    rgb: AXIS_INDICATOR_Z,
    rotation: [0, -Math.PI / 2, 0] as [number, number, number], // rotated to +Z
    headPos: new Vector3(0, 0, 1),
    negHeadPos: new Vector3(0, 0, -1),
    alpha: -Math.PI / 2,
    beta: Math.PI / 2,
    negAlpha: Math.PI / 2,
    negBeta: Math.PI / 2,
  },
] as const;

const BAR_SCALE: [number, number, number] = [0.8, 0.05, 0.05];
const HEAD_SIZE = 0.28;
const NEG_HEAD_SIZE = 0.18;
const HEAD_LABEL_FONT = 'bold 24px Inter, Arial, sans-serif';
const HEAD_CANVAS_SIZE = 64;

// ---------------------------------------------------------------------------
// AxisIndicator3D
// ---------------------------------------------------------------------------

export interface AxisIndicator3D {
  dispose: () => void;
}

/**
 * 3D coordinate-axis indicator rendered in the bottom-left viewport corner.
 * Positive axes show coloured circles with letter labels (X / Y / Z).
 * Negative axes show smaller unlabelled dots.
 * Clicking any head animates the main camera to face along that axis.
 */
export function createAxisIndicator(
  mainScene: Scene,
  mainCamera: ArcRotateCamera,
  sceneGraph: SceneGraphManager,
): AxisIndicator3D {
  const engine = mainScene.getEngine();

  // ── Overlay scene ────────────────────────────────────────────────────
  const overlayScene = new Scene(engine, { virtual: true });
  overlayScene.autoClear = false;
  overlayScene.autoClearDepthAndStencil = true;
  overlayScene.clearColor = new Color4(0, 0, 0, 0);

  // ── Orthographic camera ──────────────────────────────────────────────
  const overlayCam = new ArcRotateCamera(
    'axis_ind_cam', Math.PI / 4, Math.PI / 3, 4,
    Vector3.Zero(), overlayScene,
  );
  overlayCam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const orthoSize = 1.4;
  overlayCam.orthoLeft = -orthoSize;
  overlayCam.orthoRight = orthoSize;
  overlayCam.orthoTop = orthoSize;
  overlayCam.orthoBottom = -orthoSize;
  overlayCam.minZ = 0.1;
  overlayCam.maxZ = 20;
  overlayCam.viewport = new Viewport(0.0, 0.0, 0.13, 0.17);

  // ── Build axes ───────────────────────────────────────────────────────
  interface HeadEntry {
    mesh: Mesh;
    baseScale: number;
    alpha: number;
    beta: number;
    isPositive: boolean;
  }
  const heads: HeadEntry[] = [];

  for (const axis of AXES) {
    // Axis bar — elongated box, like drei
    const barMat = new StandardMaterial(`ai_bar_${axis.name}`, overlayScene);
    barMat.emissiveColor = axis.rgb;
    barMat.disableLighting = true;

    const barGroup = new Mesh(`ai_bargroup_${axis.name}`, overlayScene);
    barGroup.rotation.set(axis.rotation[0], axis.rotation[1], axis.rotation[2]);

    const bar = MeshBuilder.CreateBox(`ai_bar_${axis.name}`, {
      width: BAR_SCALE[0], height: BAR_SCALE[1], depth: BAR_SCALE[2],
    }, overlayScene);
    bar.material = barMat;
    bar.position = new Vector3(0.4, 0, 0); // offset half-length along local X
    bar.parent = barGroup;
    bar.isPickable = false;

    // ── Positive axis head (circle + label) ────────────────────────────
    const posTex = makeAxisHeadTexture(
      `ai_head_tex_${axis.name}`, axis.color, axis.name, overlayScene,
    );
    const posHead = createHeadPlane(
      `ai_head_${axis.name}`, posTex, HEAD_SIZE, axis.headPos, overlayScene,
    );
    heads.push({
      mesh: posHead, baseScale: HEAD_SIZE,
      alpha: axis.alpha, beta: axis.beta, isPositive: true,
    });

    // ── Negative axis head (smaller dot, no label) ─────────────────────
    const negTex = makeAxisHeadTexture(
      `ai_neghead_tex_${axis.name}`, axis.color, undefined, overlayScene,
    );
    const negHead = createHeadPlane(
      `ai_neghead_${axis.name}`, negTex, NEG_HEAD_SIZE, axis.negHeadPos, overlayScene,
    );
    negHead.visibility = 0.7;
    heads.push({
      mesh: negHead, baseScale: NEG_HEAD_SIZE,
      alpha: axis.negAlpha, beta: axis.negBeta, isPositive: false,
    });
  }

  // ── Hover state ──────────────────────────────────────────────────────
  let hoveredHead: HeadEntry | null = null;
  const canvas = engine.getRenderingCanvas();

  function clearHover(): void {
    if (hoveredHead) {
      const s = hoveredHead.baseScale;
      hoveredHead.mesh.scaling.setAll(s);
      hoveredHead = null;
    }
    if (canvas) canvas.style.cursor = '';
  }

  // ── Sync & render ────────────────────────────────────────────────────
  const vp = overlayCam.viewport;

  const syncObserver = mainScene.onBeforeRenderObservable.add(() => {
    overlayCam.alpha = mainCamera.alpha;
    overlayCam.beta = mainCamera.beta;

    // Aspect ratio correction
    const canvasW = engine.getRenderWidth();
    const canvasH = engine.getRenderHeight();
    const vpAspect = (vp.width * canvasW) / (vp.height * canvasH);
    if (vpAspect >= 1) {
      overlayCam.orthoLeft = -orthoSize * vpAspect;
      overlayCam.orthoRight = orthoSize * vpAspect;
      overlayCam.orthoTop = orthoSize;
      overlayCam.orthoBottom = -orthoSize;
    } else {
      overlayCam.orthoLeft = -orthoSize;
      overlayCam.orthoRight = orthoSize;
      overlayCam.orthoTop = orthoSize / vpAspect;
      overlayCam.orthoBottom = -orthoSize / vpAspect;
    }
  });

  const renderObserver = mainScene.onAfterRenderObservable.add(() => {
    overlayScene.render();
  });

  // ── Pointer events ───────────────────────────────────────────────────
  function pointerInViewport(evt: PointerEvent): { px: number; py: number } | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    // Babylon viewport y is bottom-up; convert to screen top-down coords.
    const sl = engine.getHardwareScalingLevel();
    const cw = canvas.width; // render-buffer size
    const ch = canvas.height;
    const vpLeft = vp.x * cw;
    const vpTop = (1 - vp.y - vp.height) * ch;
    const vpW = vp.width * cw;
    const vpH = vp.height * ch;

    // Pointer in render-buffer coords
    const bx = x / sl;
    const by = y / sl;
    if (bx < vpLeft || bx > vpLeft + vpW || by < vpTop || by > vpTop + vpH) {
      return null;
    }

    // scene.pick() expects CSS-space coords
    return { px: x, py: y };
  }

  function onPointerMove(evt: PointerEvent): void {
    const hit = pointerInViewport(evt);
    if (!hit) {
      clearHover();
      return;
    }

    const pickResult = overlayScene.pick(hit.px, hit.py, (m) => m.isPickable, false, overlayCam);
    if (!pickResult?.hit || !pickResult.pickedMesh) {
      clearHover();
      return;
    }

    const entry = heads.find((h) => h.mesh === pickResult.pickedMesh);
    if (entry && entry !== hoveredHead) {
      clearHover();
      hoveredHead = entry;
      entry.mesh.scaling.setAll(entry.baseScale * 1.25);
      if (canvas) canvas.style.cursor = 'pointer';
    } else if (!entry) {
      clearHover();
    }
  }

  function onPointerDown(evt: PointerEvent): void {
    if (!pointerInViewport(evt) || !hoveredHead) return;
    evt.stopPropagation();
    evt.preventDefault();
    sceneGraph.animateCameraTo(hoveredHead.alpha, hoveredHead.beta, undefined, 300);
  }

  canvas?.addEventListener('pointermove', onPointerMove);
  canvas?.addEventListener('pointerdown', onPointerDown);

  // ── Dispose ──────────────────────────────────────────────────────────
  return {
    dispose() {
      canvas?.removeEventListener('pointermove', onPointerMove);
      canvas?.removeEventListener('pointerdown', onPointerDown);
      if (canvas) canvas.style.cursor = '';
      mainScene.onBeforeRenderObservable.remove(syncObserver);
      mainScene.onAfterRenderObservable.remove(renderObserver);
      overlayScene.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a 64×64 canvas texture with a filled circle and optional letter label. */
function makeAxisHeadTexture(
  name: string,
  circleColor: string,
  label: string | undefined,
  scene: Scene,
): DynamicTexture {
  const tex = new DynamicTexture(name, HEAD_CANVAS_SIZE, scene, true);
  tex.anisotropicFilteringLevel = 4;

  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const s = HEAD_CANVAS_SIZE;

  ctx.clearRect(0, 0, s, s);

  // Filled circle
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.38, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = circleColor;
  ctx.fill();

  // Label
  if (label) {
    ctx.font = HEAD_LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, s / 2, s / 2 + 1);
  }

  tex.update();
  return tex;
}

/** Create a billboard plane for an axis head, positioned at the given point. */
function createHeadPlane(
  name: string,
  tex: DynamicTexture,
  size: number,
  position: Vector3,
  scene: Scene,
): Mesh {
  const plane = MeshBuilder.CreatePlane(name, { size: 1 }, scene);
  plane.scaling.setAll(size);
  plane.position = position;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = true;

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.diffuseTexture = tex;
  (mat.diffuseTexture as Texture).hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = Color3.White();
  mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;

  return plane;
}
