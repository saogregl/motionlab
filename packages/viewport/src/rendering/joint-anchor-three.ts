import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

import { AXIS_X, AXIS_Y, AXIS_Z, JOINT_STEEL_BLUE } from './colors-three.js';

// ── Result interface ──

export interface JointAnchorResult {
  rootNode: Group;
  meshes: Mesh[];
  triadLines: Line[];
  dispose(): void;
}

// ── Geometry segment counts ──

const SEG = 32; // sphere segments
const RSEG = 16; // radial segments for cylinders / tori
const TSEG = 48; // tubular segments for tori
const CONE_SEG = 16;

// ── Material ──

function makeAnchorMaterial(color: Color, opacity = 0.75): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.25,
    envMapIntensity: 0.8,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
}

function makeLowOpacityMaterial(color: Color): MeshStandardMaterial {
  return makeAnchorMaterial(color, 0.4);
}

// ── Geometry template cache ──

const _geoCache = new Map<string, BufferGeometry>();

function cached<T extends BufferGeometry>(key: string, factory: () => T): T {
  let geo = _geoCache.get(key) as T | undefined;
  if (!geo) {
    geo = factory();
    _geoCache.set(key, geo);
  }
  return geo;
}

// ── Triad ──

const TRIAD_LENGTH = 0.04;
const TRIAD_Z_LENGTH = 0.055;
const TRIAD_OPACITY = 0.35;

function createMiniTriad(): { group: Group; lines: Line[] } {
  const group = new Group();
  group.name = 'joint_triad';
  group.renderOrder = 6;

  const axes: Array<{ dir: [number, number, number]; color: typeof AXIS_X; length: number }> = [
    { dir: [1, 0, 0], color: AXIS_X, length: TRIAD_LENGTH },
    { dir: [0, 1, 0], color: AXIS_Y, length: TRIAD_LENGTH },
    { dir: [0, 0, 1], color: AXIS_Z, length: TRIAD_Z_LENGTH },
  ];

  const lines: Line[] = [];
  for (const { dir, color, length } of axes) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, dir[0] * length, dir[1] * length, dir[2] * length], 3),
    );
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: TRIAD_OPACITY,
      depthTest: false,
    });
    const line = new Line(geo, mat);
    line.renderOrder = 6;
    group.add(line);
    lines.push(line);
  }

  return { group, lines };
}

// ── Alignment helper ──

const _yAxis = new Vector3(0, 1, 0);
const _tempQ = new Quaternion();

function orientToAxis(group: Group, axis: Vector3): void {
  const dir = axis.clone().normalize();
  _tempQ.setFromUnitVectors(_yAxis, dir);
  group.quaternion.copy(_tempQ);
}

// ── Helper: add mesh to group + list ──

function addMesh(
  root: Group,
  meshes: Mesh[],
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
): Mesh {
  const mesh = new Mesh(geo.clone(), mat);
  mesh.userData = { entityType: 'joint' };
  mesh.renderOrder = 5;
  root.add(mesh);
  meshes.push(mesh);
  return mesh;
}

// ── Per-type geometry factories ──

/**
 * Revolute: Bearing housing — flat disc with axle through center + torus bearing races at edges.
 */
function buildRevoluteGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const discRadius = 0.022;
  const discHeight = 0.012;
  const axleRadius = 0.005;
  const axleLength = 0.08;
  const raceRadius = discRadius;
  const raceTube = 0.0025;

  // Outer disc (housing)
  const disc = cached(
    'rev_disc',
    () => new CylinderGeometry(discRadius, discRadius, discHeight, RSEG),
  );
  addMesh(root, meshes, disc, makeAnchorMaterial(color));

  // Axle through center
  const axle = cached(
    'rev_axle',
    () => new CylinderGeometry(axleRadius, axleRadius, axleLength, RSEG),
  );
  addMesh(root, meshes, axle, makeAnchorMaterial(color));

  // Top bearing race
  const race = cached('rev_race', () => new TorusGeometry(raceRadius, raceTube, RSEG, TSEG));
  const topRace = addMesh(root, meshes, race, makeAnchorMaterial(color, 0.6));
  topRace.position.y = discHeight / 2;
  topRace.rotation.x = Math.PI / 2;

  // Bottom bearing race
  const botRace = addMesh(root, meshes, race, makeAnchorMaterial(color, 0.6));
  botRace.position.y = -discHeight / 2;
  botRace.rotation.x = Math.PI / 2;
}

/**
 * Prismatic: Rail-and-slider — box slider on a cylindrical rail with arrowheads.
 */
function buildPrismaticGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const railRadius = 0.004;
  const railLength = 0.12;
  const blockW = 0.02;
  const blockH = 0.018;
  const blockD = 0.025;
  const arrowR = 0.008;
  const arrowH = 0.016;

  // Rail cylinder
  const rail = cached(
    'pri_rail',
    () => new CylinderGeometry(railRadius, railRadius, railLength, RSEG),
  );
  addMesh(root, meshes, rail, makeAnchorMaterial(color));

  // Slider block
  const block = cached('pri_block', () => new BoxGeometry(blockW, blockH, blockD));
  addMesh(root, meshes, block, makeAnchorMaterial(color));

  // Top arrowhead
  const cone = cached('pri_cone', () => new ConeGeometry(arrowR, arrowH, CONE_SEG));
  const topArrow = addMesh(root, meshes, cone, makeAnchorMaterial(color, 0.6));
  topArrow.position.y = railLength / 2;

  // Bottom arrowhead
  const botArrow = addMesh(root, meshes, cone, makeAnchorMaterial(color, 0.6));
  botArrow.position.y = -railLength / 2;
  botArrow.rotation.z = Math.PI;
}

/**
 * Fixed: Rigid bracket — two intersecting rectangular prisms forming a cross.
 */
function buildFixedGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const armLength = 0.035;
  const armThick = 0.01;

  // Horizontal bar
  const barH = cached('fix_barH', () => new BoxGeometry(armLength, armThick, armThick));
  addMesh(root, meshes, barH, makeAnchorMaterial(color));

  // Vertical bar
  const barV = cached('fix_barV', () => new BoxGeometry(armThick, armLength, armThick));
  addMesh(root, meshes, barV, makeAnchorMaterial(color));
}

/**
 * Spherical: Ball-and-socket — partial outer hemisphere cup + solid inner ball.
 */
function buildSphericalGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const ballRadius = 0.016;
  const cupRadius = 0.024;

  // Inner ball
  const ball = cached('sph_ball', () => new SphereGeometry(ballRadius, SEG, SEG));
  addMesh(root, meshes, ball, makeAnchorMaterial(color));

  // Outer cup (hemisphere) — phiStart=0, phiLength=2*PI, thetaStart=0, thetaLength=PI/2
  const cup = cached(
    'sph_cup',
    () => new SphereGeometry(cupRadius, SEG, SEG / 2, 0, Math.PI * 2, 0, Math.PI * 0.55),
  );
  const cupMesh = addMesh(root, meshes, cup, makeLowOpacityMaterial(color));
  cupMesh.rotation.x = Math.PI; // cup opens upward
}

/**
 * Cylindrical: Bearing housing + extended axle with arrowheads (revolute + prismatic cues).
 */
function buildCylindricalGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const discRadius = 0.018;
  const discHeight = 0.01;
  const axleRadius = 0.004;
  const axleLength = 0.1;
  const raceRadius = discRadius;
  const raceTube = 0.002;
  const arrowR = 0.007;
  const arrowH = 0.014;

  // Housing disc
  const disc = cached(
    'cyl_disc',
    () => new CylinderGeometry(discRadius, discRadius, discHeight, RSEG),
  );
  addMesh(root, meshes, disc, makeAnchorMaterial(color));

  // Extended axle
  const axle = cached(
    'cyl_axle',
    () => new CylinderGeometry(axleRadius, axleRadius, axleLength, RSEG),
  );
  addMesh(root, meshes, axle, makeAnchorMaterial(color));

  // Bearing race
  const race = cached('cyl_race', () => new TorusGeometry(raceRadius, raceTube, RSEG, TSEG));
  const topRace = addMesh(root, meshes, race, makeAnchorMaterial(color, 0.5));
  topRace.position.y = discHeight / 2;
  topRace.rotation.x = Math.PI / 2;

  // Arrowheads at axle ends
  const cone = cached('cyl_cone', () => new ConeGeometry(arrowR, arrowH, CONE_SEG));
  const topArrow = addMesh(root, meshes, cone, makeAnchorMaterial(color, 0.6));
  topArrow.position.y = axleLength / 2;

  const botArrow = addMesh(root, meshes, cone, makeAnchorMaterial(color, 0.6));
  botArrow.position.y = -axleLength / 2;
  botArrow.rotation.z = Math.PI;
}

/**
 * Universal: Gimbal cross — two perpendicular torus rings + small central sphere.
 */
function buildUniversalGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const ringRadius = 0.025;
  const ringTube = 0.003;
  const centerRadius = 0.008;

  // Central sphere
  const center = cached('uni_center', () => new SphereGeometry(centerRadius, SEG, SEG));
  addMesh(root, meshes, center, makeAnchorMaterial(color));

  // Ring 1 (XZ plane)
  const ring = cached('uni_ring', () => new TorusGeometry(ringRadius, ringTube, RSEG, TSEG));
  const ring1 = addMesh(root, meshes, ring, makeAnchorMaterial(color, 0.65));
  ring1.rotation.x = Math.PI / 2;

  // Ring 2 (YZ plane)
  const ring2 = addMesh(root, meshes, ring, makeAnchorMaterial(color, 0.65));
  ring2.rotation.y = Math.PI / 2;
}

/**
 * Planar: Flat platform disc + subtle cross pattern on surface.
 */
function buildPlanarGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const discRadius = 0.028;
  const discHeight = 0.005;
  const crossW = 0.004;
  const crossL = 0.04;

  // Platform disc
  const disc = cached(
    'pla_disc',
    () => new CylinderGeometry(discRadius, discRadius, discHeight, RSEG),
  );
  addMesh(root, meshes, disc, makeLowOpacityMaterial(color));

  // Cross bar X (on top surface)
  const barX = cached('pla_barX', () => new BoxGeometry(crossL, crossW * 0.5, crossW));
  const crossX = addMesh(root, meshes, barX, makeAnchorMaterial(color, 0.6));
  crossX.position.y = discHeight / 2 + crossW * 0.25;

  // Cross bar Z
  const barZ = cached('pla_barZ', () => new BoxGeometry(crossW, crossW * 0.5, crossL));
  const crossZ = addMesh(root, meshes, barZ, makeAnchorMaterial(color, 0.6));
  crossZ.position.y = discHeight / 2 + crossW * 0.25;
}

/**
 * Default fallback: simple sphere + pin (for unknown/future joint types).
 */
function buildDefaultGeometry(root: Group, meshes: Mesh[], color: Color): void {
  const sphereRadius = 0.02;
  const pinRadius = 0.005;
  const pinLength = 0.06;

  const sphere = cached('def_sphere', () => new SphereGeometry(sphereRadius, SEG, SEG));
  addMesh(root, meshes, sphere, makeAnchorMaterial(color));

  const pin = cached('def_pin', () => new CylinderGeometry(pinRadius, pinRadius, pinLength, RSEG));
  addMesh(root, meshes, pin, makeAnchorMaterial(color));
}

// ── Builder dispatch ──

const BUILDERS: Record<string, (root: Group, meshes: Mesh[], color: Color) => void> = {
  revolute: buildRevoluteGeometry,
  prismatic: buildPrismaticGeometry,
  fixed: buildFixedGeometry,
  spherical: buildSphericalGeometry,
  cylindrical: buildCylindricalGeometry,
  universal: buildUniversalGeometry,
  planar: buildPlanarGeometry,
};

// ── Factory ──

export function createJointAnchor(jointType: string, alignmentAxis?: Vector3): JointAnchorResult {
  const color = JOINT_STEEL_BLUE;

  const root = new Group();
  root.name = 'joint_anchor';
  root.renderOrder = 5;

  const meshes: Mesh[] = [];

  const builder = BUILDERS[jointType] ?? buildDefaultGeometry;
  builder(root, meshes, color);

  const { group: triadGroup, lines: triadLines } = createMiniTriad();
  root.add(triadGroup);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientToAxis(root, alignmentAxis);
  }

  return {
    rootNode: root,
    meshes,
    triadLines,
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
      for (const line of triadLines) {
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
      }
    },
  };
}
