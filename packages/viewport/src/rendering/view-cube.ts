import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  MultiMaterial,
  Scene,
  StandardMaterial,
  SubMesh,
  Texture,
  Vector3,
  Viewport,
} from '@babylonjs/core';

import type { SceneGraphManager } from '../scene-graph.js';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface FaceDef {
  name: string;
  label: string;
  /** Target camera alpha / beta when this face is clicked. */
  alpha: number;
  beta: number;
}

/**
 * Babylon box face ordering for multi-material:
 *   0 = +Z (front)   1 = -Z (back)
 *   2 = +X (right)   3 = -X (left)
 *   4 = +Y (top)     5 = -Y (bottom)
 *
 * drei face order: Right, Left, Top, Bottom, Front, Back
 * We map to Babylon sub-mesh indices accordingly.
 */
const FACES: (FaceDef & { subMeshIndex: number })[] = [
  { subMeshIndex: 0, name: 'front', label: 'FRONT', alpha: -Math.PI / 2, beta: Math.PI / 2 },
  { subMeshIndex: 1, name: 'back', label: 'BACK', alpha: Math.PI / 2, beta: Math.PI / 2 },
  { subMeshIndex: 2, name: 'right', label: 'RIGHT', alpha: 0, beta: Math.PI / 2 },
  { subMeshIndex: 3, name: 'left', label: 'LEFT', alpha: Math.PI, beta: Math.PI / 2 },
  { subMeshIndex: 4, name: 'top', label: 'TOP', alpha: -Math.PI / 2, beta: 0.01 },
  { subMeshIndex: 5, name: 'bottom', label: 'BOTTOM', alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
];

// Direction vectors for edges (one component is 0) and corners (all ±1).
// Matching drei's approach — positions are normalised direction × scale.
const EDGE_SCALE = 0.38;
const EDGE_DIRS: number[][] = [
  [1, 1, 0], [1, 0, 1], [1, 0, -1], [1, -1, 0],
  [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
  [-1, 1, 0], [-1, 0, 1], [-1, 0, -1], [-1, -1, 0],
];
const CORNER_DIRS: number[][] = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];

// Visual tuning
const TEX_SIZE = 128;
const BG_COLOR = '#e0e0e4';
const BG_HOVER = '#4a90d9';
const TEXT_COLOR = '#444';
const TEXT_HOVER = '#fff';
const STROKE_COLOR = '#b8b8bc';
const EDGE_HOVER_COLOR = new Color3(0.35, 0.6, 0.95);

// ---------------------------------------------------------------------------
// ViewCubeOverlay
// ---------------------------------------------------------------------------

export interface ViewCubeOverlay {
  dispose: () => void;
}

/**
 * Interactive 3D ViewCube rendered in a corner viewport overlay.
 * Clicking a face / edge / corner animates the main camera to that orientation.
 */
export function createViewCube(
  mainScene: Scene,
  sceneGraph: SceneGraphManager,
): ViewCubeOverlay {
  const engine = mainScene.getEngine();

  // ── Overlay scene ────────────────────────────────────────────────────
  const overlayScene = new Scene(engine, { virtual: true });
  overlayScene.autoClear = false;
  overlayScene.autoClearDepthAndStencil = true;
  overlayScene.clearColor = new Color4(0, 0, 0, 0);
  overlayScene.blockMaterialDirtyMechanism = true;

  // ── Orthographic camera ──────────────────────────────────────────────
  const overlayCam = new ArcRotateCamera(
    'viewcube_cam', Math.PI / 4, Math.PI / 3, 4,
    Vector3.Zero(), overlayScene,
  );
  overlayCam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const orthoSize = 1.6;
  overlayCam.orthoLeft = -orthoSize;
  overlayCam.orthoRight = orthoSize;
  overlayCam.orthoTop = orthoSize;
  overlayCam.orthoBottom = -orthoSize;
  overlayCam.minZ = 0.1;
  overlayCam.maxZ = 20;
  overlayCam.viewport = new Viewport(0.82, 0.72, 0.17, 0.26);

  // ── Build the cube with per-face materials ───────────────────────────
  const cube = MeshBuilder.CreateBox('viewcube_box', { size: 1 }, overlayScene);
  cube.isPickable = true;
  cube.enableEdgesRendering(0.9999);
  cube.edgesWidth = 1.0;
  cube.edgesColor = new Color4(0.55, 0.55, 0.6, 0.7);

  // Babylon boxes have 6 faces, each with 2 triangles → 12 triangle groups.
  // SubMesh(materialIndex, verticesStart, verticesCount, indexStart, indexCount)
  // A unit box has 24 vertices and 36 indices (6 faces × 4 verts, 6 faces × 6 idx).
  const verticesPerFace = 4;
  const indicesPerFace = 6;
  cube.subMeshes.length = 0; // clear default single sub-mesh
  for (let i = 0; i < 6; i++) {
    new SubMesh(i, i * verticesPerFace, verticesPerFace, i * indicesPerFace, indicesPerFace, cube);
  }

  const multiMat = new MultiMaterial('viewcube_multi', overlayScene);
  const maxAniso = engine.getCaps().maxAnisotropy ?? 4;

  // Build per-face materials & textures
  interface FaceEntry {
    def: (typeof FACES)[number];
    mat: StandardMaterial;
    tex: DynamicTexture;
  }
  const faceEntries: FaceEntry[] = [];

  for (const face of FACES) {
    const tex = new DynamicTexture(`vc_tex_${face.name}`, TEX_SIZE, overlayScene, true);
    tex.anisotropicFilteringLevel = maxAniso;
    drawFaceCanvas(tex, face.label, BG_COLOR, TEXT_COLOR, STROKE_COLOR);

    const mat = new StandardMaterial(`vc_mat_${face.name}`, overlayScene);
    mat.diffuseTexture = tex;
    (mat.diffuseTexture as Texture).hasAlpha = false;
    mat.emissiveColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.backFaceCulling = true;

    multiMat.subMaterials[face.subMeshIndex] = mat;
    faceEntries.push({ def: face, mat, tex });
  }
  cube.material = multiMat;

  // ── Edge & corner hit boxes ──────────────────────────────────────────
  interface HitBox {
    mesh: Mesh;
    mat: StandardMaterial;
    direction: Vector3;
    alpha: number;
    beta: number;
  }
  const hitBoxes: HitBox[] = [];

  function dirToAlphaBeta(dir: Vector3): { alpha: number; beta: number } {
    // Convert a direction vector to ArcRotateCamera alpha/beta.
    // alpha = angle in XZ plane from +Z axis, beta = angle from +Y axis.
    const alpha = -Math.atan2(dir.z, dir.x) - Math.PI / 2;
    const beta = Math.acos(Math.max(-1, Math.min(1, dir.y / dir.length())));
    return {
      alpha,
      beta: Math.max(0.01, Math.min(Math.PI - 0.01, beta)),
    };
  }

  function createHitBox(
    name: string,
    dirArr: number[],
    dims: [number, number, number],
  ): HitBox {
    const dir = new Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
    const pos = dir.scale(EDGE_SCALE);
    const { alpha, beta } = dirToAlphaBeta(dir);

    const mesh = MeshBuilder.CreateBox(name, {
      width: dims[0], height: dims[1], depth: dims[2],
    }, overlayScene);
    mesh.position = pos;
    mesh.scaling.setAll(1.01); // slightly larger to overlap edges
    mesh.isPickable = true;
    mesh.metadata = { viewcubeHitBox: true };

    const mat = new StandardMaterial(`${name}_mat`, overlayScene);
    mat.emissiveColor = EDGE_HOVER_COLOR;
    mat.disableLighting = true;
    mat.alpha = 0.6;
    mesh.material = mat;
    mesh.visibility = 0; // hidden until hover

    const hb: HitBox = { mesh, mat, direction: dir, alpha, beta };
    hitBoxes.push(hb);
    return hb;
  }

  // Edges: one zero axis → elongated along that axis
  for (let i = 0; i < EDGE_DIRS.length; i++) {
    const d = EDGE_DIRS[i];
    const dims: [number, number, number] = [
      d[0] === 0 ? 0.5 : 0.25,
      d[1] === 0 ? 0.5 : 0.25,
      d[2] === 0 ? 0.5 : 0.25,
    ];
    createHitBox(`vc_edge_${i}`, d, dims);
  }

  // Corners: small cubes
  for (let i = 0; i < CORNER_DIRS.length; i++) {
    createHitBox(`vc_corner_${i}`, CORNER_DIRS[i], [0.25, 0.25, 0.25]);
  }

  // ── Hover state ──────────────────────────────────────────────────────
  let hoveredFace: FaceEntry | null = null;
  let hoveredHitBox: HitBox | null = null;
  const canvas = engine.getRenderingCanvas();

  function clearHover(): void {
    if (hoveredFace) {
      drawFaceCanvas(hoveredFace.tex, hoveredFace.def.label, BG_COLOR, TEXT_COLOR, STROKE_COLOR);
      hoveredFace = null;
    }
    if (hoveredHitBox) {
      hoveredHitBox.mesh.visibility = 0;
      hoveredHitBox = null;
    }
    if (canvas) canvas.style.cursor = '';
  }

  // ── Sync & render ────────────────────────────────────────────────────
  const mainCam = sceneGraph.camera;
  const vp = overlayCam.viewport;

  const syncObserver = mainScene.onBeforeRenderObservable.add(() => {
    overlayCam.alpha = mainCam.alpha;
    overlayCam.beta = mainCam.beta;

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

    const mesh = pickResult.pickedMesh;

    // Check edge/corner hit box
    if (mesh.metadata?.viewcubeHitBox) {
      const hb = hitBoxes.find((h) => h.mesh === mesh);
      if (hb && hb !== hoveredHitBox) {
        clearHover();
        hoveredHitBox = hb;
        hb.mesh.visibility = 1;
        if (canvas) canvas.style.cursor = 'pointer';
      }
      return;
    }

    // Check cube face via sub-mesh index
    if (mesh === cube && pickResult.subMeshId !== undefined) {
      const entry = faceEntries.find((f) => f.def.subMeshIndex === pickResult.subMeshId);
      if (entry && entry !== hoveredFace) {
        clearHover();
        hoveredFace = entry;
        drawFaceCanvas(entry.tex, entry.def.label, BG_HOVER, TEXT_HOVER, BG_HOVER);
        if (canvas) canvas.style.cursor = 'pointer';
      }
      return;
    }

    clearHover();
  }

  function onPointerDown(evt: PointerEvent): void {
    if (!pointerInViewport(evt)) return;

    if (hoveredFace) {
      evt.stopPropagation();
      evt.preventDefault();
      sceneGraph.animateCameraTo(hoveredFace.def.alpha, hoveredFace.def.beta, undefined, 300);
      return;
    }

    if (hoveredHitBox) {
      evt.stopPropagation();
      evt.preventDefault();
      sceneGraph.animateCameraTo(hoveredHitBox.alpha, hoveredHitBox.beta, undefined, 300);
    }
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
// Canvas texture rendering
// ---------------------------------------------------------------------------

function drawFaceCanvas(
  tex: DynamicTexture,
  label: string,
  bgColor: string,
  textColor: string,
  strokeColor: string,
): void {
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const s = tex.getSize().width;

  // Background fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, s, s);

  // Border stroke
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, s - 2, s - 2);

  // Centered label
  ctx.font = 'bold 20px Inter, Arial, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s / 2, s / 2 + 1);

  tex.update();
}
