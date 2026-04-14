/**
 * SDF billboarded quad line renderer.
 *
 * Renders polylines as screen-space quads with an analytic signed-distance-field
 * in the fragment shader.  Advantages over Line2 / LineMaterial:
 *   - Perfect round endcaps (capsule SDF) at polyline start and end
 *   - Flat joins at interior segment boundaries — no doubled-up alpha "beads"
 *   - Crisp analytic AA (1-pixel smoothstep on the distance field)
 *   - Smooth dash caps (fwidth-adaptive soft edges at dash boundaries)
 *   - Optional glow halo (exponential falloff beyond the line edge)
 *
 * Dash units match LineMaterial convention: world-space arc length.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

// ── Shaders ─────────────────────────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  // Custom attributes — one segment per quad, 4 verts per segment.
  attribute vec3 aPointA;      // segment world-space start
  attribute vec3 aPointB;      // segment world-space end
  attribute float aSide;       // +1 / -1 (which side of the segment centerline)
  attribute float aCapT;       // 0 = near A endpoint, 1 = near B endpoint
  attribute float aCapFlatA;   // 1 = flat cut at A (interior join), 0 = round cap
  attribute float aCapFlatB;   // 1 = flat cut at B (interior join), 0 = round cap
  attribute float aLineDistA;  // cumulative arc length at A (world units)
  attribute float aLineDistB;  // cumulative arc length at B (world units)

  uniform vec2 uResolution;    // canvas size in pixels
  uniform float uHalfWidth;    // half line width in pixels

  varying float vLocalX;   // pixels along segment from A
  varying float vLocalY;   // pixels perpendicular from centerline
  varying float vHalfLen;  // half segment length in pixels
  varying float vLineDist; // interpolated cumulative arc length (world units)

  void main() {
    // Project endpoints to clip space then screen space (pixels).
    vec4 clipA = projectionMatrix * modelViewMatrix * vec4(aPointA, 1.0);
    vec4 clipB = projectionMatrix * modelViewMatrix * vec4(aPointB, 1.0);

    vec2 scrA = (clipA.xy / clipA.w * 0.5 + 0.5) * uResolution;
    vec2 scrB = (clipB.xy / clipB.w * 0.5 + 0.5) * uResolution;

    vec2 dir = scrB - scrA;
    float segLen = length(dir);
    vec2 unitDir  = dir / max(segLen, 0.0001);
    vec2 unitPerp = vec2(-unitDir.y, unitDir.x);

    // Extend the quad past each endpoint for round caps and AA fringe.
    // Interior joins use flat cuts — no extension — so adjacent quads don't
    // overlap and produce doubled-alpha bright spots ("beads").
    float ext = uHalfWidth + 1.5;

    float isACap = aCapT < 0.5 ? 1.0 : 0.0;
    float isBCap = 1.0 - isACap;
    // capExtAmount: how far to push the quad corner past the endpoint.
    // Round cap → ext;  flat cut → 0 (quad stops exactly at the endpoint).
    float capExtAmount = isACap * (1.0 - aCapFlatA) * ext
                       + isBCap * (1.0 - aCapFlatB) * ext;
    float capSign = aCapT < 0.5 ? -1.0 : 1.0;

    vec2 anchor = mix(scrA, scrB, aCapT);
    vec2 screenPos = anchor
      + unitPerp * aSide * ext          // always expand perpendicular for AA
      + unitDir  * capSign * capExtAmount;

    // Back-project to clip space, preserving depth from the near anchor point.
    vec4 clipAnchor = mix(clipA, clipB, aCapT);
    vec2 ndcPos = screenPos / uResolution * 2.0 - 1.0;
    gl_Position = vec4(ndcPos * clipAnchor.w, clipAnchor.z, clipAnchor.w);

    // Local pixel-space coordinates (origin at A, x-axis = segment direction).
    // For flat caps the quad boundary aligns with the endpoint so vLocalX
    // reaches exactly 0 (A-end) or segLen (B-end) — the SDF naturally flat-clips.
    vLocalX  = dot(screenPos - scrA, unitDir);
    vLocalY  = dot(screenPos - scrA, unitPerp);
    vHalfLen = segLen * 0.5;

    // Interpolated arc length for dash phase (bilinear across quad ≈ correct).
    vLineDist = mix(aLineDistA, aLineDistB, aCapT);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uHalfWidth;
  uniform float uDashed;       // 1.0 = dashed, 0.0 = solid
  uniform float uDashSize;     // dash on-length (world units)
  uniform float uGapSize;      // dash gap-length (world units)
  uniform float uDashOffset;   // animated phase offset (world units)
  uniform float uGlowStrength; // peak glow opacity multiplier (0 = off)
  uniform float uGlowFalloff;  // exponential falloff per pixel beyond edge

  varying float vLocalX;
  varying float vLocalY;
  varying float vHalfLen;
  varying float vLineDist;

  void main() {
    // Capsule SDF: exact distance (px) from the segment + optional round caps.
    // Re-center on the segment midpoint so the capsule spans [-vHalfLen, vHalfLen].
    // For flat-cap ends the quad stops at the endpoint, so the round-cap
    // portion of the SDF is never reached — the cut is naturally flat.
    vec2 p = vec2(vLocalX - vHalfLen, vLocalY);
    float dx = max(abs(p.x) - vHalfLen, 0.0);
    float d  = length(vec2(dx, p.y)) - uHalfWidth;

    // Analytic 1-px AA band.
    float alpha = smoothstep(1.0, -1.0, d) * uOpacity;

    // Dash pattern with fwidth-adaptive soft edges at dash boundaries.
    // fwidth(vLineDist) ≈ 1 pixel of world arc length → auto-adapts to zoom.
    if (uDashed > 0.5) {
      float period = uDashSize + uGapSize;
      float phase  = mod(vLineDist + uDashOffset, period);
      float fw     = max(fwidth(vLineDist), 1e-6);
      float onDash = smoothstep(-fw, fw, phase)
                   * smoothstep(uDashSize + fw, uDashSize - fw, phase);
      alpha *= onDash;
    }

    // Optional glow halo: exponential falloff starting at the line edge.
    if (uGlowStrength > 0.0) {
      float glowAlpha = exp(-max(d + uHalfWidth, 0.0) * uGlowFalloff)
                      * uGlowStrength * uOpacity;
      alpha = max(alpha, glowAlpha);
    }

    if (alpha < 0.005) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// ── Resolution tracking ──────────────────────────────────────────────────────

const _trackedMeshes = new Set<Mesh>();
const _sharedResolution = new Vector2(1, 1);

export function updateSDFLineResolution(width: number, height: number): void {
  _sharedResolution.set(width, height);
  for (const mesh of _trackedMeshes) {
    (mesh.material as ShaderMaterial).uniforms.uResolution.value.set(width, height);
  }
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface SDFLineOptions {
  color: Color;
  /** Line width in pixels. Default: 2. */
  lineWidth?: number;
  opacity?: number;
  depthTest?: boolean;
  toneMapped?: boolean;
  /** Render as dashes. Default: false. */
  dashed?: boolean;
  /** Dash on-length in world units (matches LineMaterial convention). Default: 0.008. */
  dashSize?: number;
  /** Dash gap-length in world units. Default: 0.004. */
  gapSize?: number;
  /** Enable soft glow halo. Default: false. */
  glow?: boolean;
  /** Peak glow alpha multiplier. Default: 0.25. */
  glowStrength?: number;
  /** Exponential glow falloff per pixel beyond the line edge. Default: 0.4. */
  glowFalloff?: number;
}

// ── Geometry builder ─────────────────────────────────────────────────────────

function buildGeometry(points: readonly Vector3[]): BufferGeometry {
  const geo = new BufferGeometry();
  const segCount = Math.max(0, points.length - 1);

  if (segCount === 0) {
    // Empty — just a dummy position attribute so Three.js is happy.
    geo.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    return geo;
  }

  const vertCount = segCount * 4;
  const idxCount = segCount * 6;

  const posA = new Float32Array(vertCount * 3);
  const posB = new Float32Array(vertCount * 3);
  const sides = new Float32Array(vertCount);
  const capTs = new Float32Array(vertCount);
  const capFlatA = new Float32Array(vertCount);
  const capFlatB = new Float32Array(vertCount);
  const distA = new Float32Array(vertCount);
  const distB = new Float32Array(vertCount);
  const idx = new Uint16Array(idxCount);

  // Cumulative arc lengths in world units (matches LineMaterial dash convention).
  const arcLen = new Float32Array(points.length);
  for (let i = 1; i < points.length; i++) {
    arcLen[i] = arcLen[i - 1] + points[i].distanceTo(points[i - 1]);
  }

  // Per segment: 4 vertices (quad corners).
  //   v0: capT=0, side=+1  (near A, one side)
  //   v1: capT=0, side=-1  (near A, other side)
  //   v2: capT=1, side=+1  (near B, one side)
  //   v3: capT=1, side=-1  (near B, other side)
  // Two triangles: (v0,v1,v2), (v1,v3,v2).
  //
  // Cap flatness rules:
  //   A-end is flat (interior join) for all segments except the very first.
  //   B-end is flat (interior join) for all segments except the very last.
  //   A round cap only extends past the first point; a round cap only extends
  //   past the last point.  This prevents adjacent capsule caps from overlapping
  //   and creating doubled-alpha bright dots at interior joins.
  for (let si = 0; si < segCount; si++) {
    const A = points[si];
    const B = points[si + 1];
    const lA = arcLen[si];
    const lB = arcLen[si + 1];
    const vb = si * 4;
    const ib = si * 6;

    const flatA = si > 0 ? 1 : 0;
    const flatB = si < segCount - 1 ? 1 : 0;

    for (let vi = 0; vi < 4; vi++) {
      const pi = (vb + vi) * 3;
      posA[pi] = A.x;
      posA[pi + 1] = A.y;
      posA[pi + 2] = A.z;
      posB[pi] = B.x;
      posB[pi + 1] = B.y;
      posB[pi + 2] = B.z;
      capFlatA[vb + vi] = flatA;
      capFlatB[vb + vi] = flatB;
      distA[vb + vi] = lA;
      distB[vb + vi] = lB;
    }
    sides[vb + 0] = +1;
    capTs[vb + 0] = 0;
    sides[vb + 1] = -1;
    capTs[vb + 1] = 0;
    sides[vb + 2] = +1;
    capTs[vb + 2] = 1;
    sides[vb + 3] = -1;
    capTs[vb + 3] = 1;

    idx[ib + 0] = vb + 0;
    idx[ib + 1] = vb + 1;
    idx[ib + 2] = vb + 2;
    idx[ib + 3] = vb + 1;
    idx[ib + 4] = vb + 3;
    idx[ib + 5] = vb + 2;
  }

  // Dummy position attribute — frustumCulled=false so the zero-sphere is harmless.
  geo.setAttribute('position', new BufferAttribute(new Float32Array(vertCount * 3), 3));
  geo.setAttribute('aPointA', new BufferAttribute(posA, 3));
  geo.setAttribute('aPointB', new BufferAttribute(posB, 3));
  geo.setAttribute('aSide', new BufferAttribute(sides, 1));
  geo.setAttribute('aCapT', new BufferAttribute(capTs, 1));
  geo.setAttribute('aCapFlatA', new BufferAttribute(capFlatA, 1));
  geo.setAttribute('aCapFlatB', new BufferAttribute(capFlatB, 1));
  geo.setAttribute('aLineDistA', new BufferAttribute(distA, 1));
  geo.setAttribute('aLineDistB', new BufferAttribute(distB, 1));
  geo.setIndex(new BufferAttribute(idx, 1));

  return geo;
}

// ── Material factory ─────────────────────────────────────────────────────────

function buildMaterial(opts: SDFLineOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: opts.depthTest ?? false,
    depthWrite: false,
    toneMapped: opts.toneMapped ?? false,
    uniforms: {
      uResolution: { value: _sharedResolution.clone() },
      uColor: { value: new Color().copy(opts.color) },
      uHalfWidth: { value: (opts.lineWidth ?? 2) * 0.5 },
      uOpacity: { value: opts.opacity ?? 1 },
      uDashed: { value: (opts.dashed ?? false) ? 1.0 : 0.0 },
      uDashSize: { value: opts.dashSize ?? 0.008 },
      uGapSize: { value: opts.gapSize ?? 0.004 },
      uDashOffset: { value: 0 },
      uGlowStrength: { value: opts.glow ? (opts.glowStrength ?? 0.25) : 0.0 },
      uGlowFalloff: { value: opts.glowFalloff ?? 0.4 },
    },
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a polyline rendered as SDF billboarded quads.
 * Returns a `Mesh` tagged with `userData.__sdfLine = true`.
 * Equivalent to `createFatLine` but with round caps, crisp AA, and glow support.
 */
export function createSDFLine(
  points: readonly Vector3[],
  opts: SDFLineOptions,
  userData?: Record<string, unknown>,
): Mesh {
  const geo = buildGeometry(points);
  const mat = buildMaterial(opts);
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData = { ...userData, __sdfLine: true };
  _trackedMeshes.add(mesh);
  return mesh;
}

/** Replace the points on an existing SDF line mesh. */
export function setSDFLinePoints(mesh: Mesh, points: readonly Vector3[]): void {
  mesh.geometry.dispose();
  mesh.geometry = buildGeometry(points);
}

/** Dispose the geometry and material, and stop tracking for resolution updates. */
export function disposeSDFLine(mesh: Mesh): void {
  _trackedMeshes.delete(mesh);
  mesh.geometry.dispose();
  (mesh.material as ShaderMaterial).dispose();
}

/** Type guard: returns true if `obj` was created by `createSDFLine`. */
export function isSDFLine(obj: unknown): obj is Mesh {
  return obj instanceof Mesh && (obj as Mesh).userData?.__sdfLine === true;
}
