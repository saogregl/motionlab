import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

import { DOF_FREE, JOINT_STEEL_BLUE } from './colors-three.js';

// ── Types ──

export interface LimitVisual {
  rootNode: Group;
  meshes: Mesh[];
  /** Update the current-position indicator (value in radians or meters). */
  update(currentValue: number | null): void;
  dispose(): void;
}

// ── Constants ──

const ARC_RADIUS = 0.10;
const ARC_TUBE = 0.006;
const ARC_RADIAL_SEGMENTS = 6;
const ARC_TUBULAR_SEGMENTS = 48;
const BAND_RADIUS = 0.008;
const BAND_RADIAL_SEGMENTS = 6;
const LIMIT_OPACITY = 0.3;
const MARKER_OPACITY = 0.85;
const REVOLUTE_MARKER_RADIUS = 0.12;
const PRISMATIC_MARKER_RADIUS = 0.014;
const PRISMATIC_MARKER_SEGMENTS = 10;

function makeLimitMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: JOINT_STEEL_BLUE,
    transparent: true,
    opacity: LIMIT_OPACITY,
    depthWrite: false,
  });
}

function makeMarkerMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: DOF_FREE,
    transparent: true,
    opacity: MARKER_OPACITY,
    depthWrite: false,
  });
}

function makeMarkerLineMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({
    color: DOF_FREE,
    transparent: true,
    opacity: MARKER_OPACITY,
    depthWrite: false,
  });
}

// ── Revolute limit: partial torus arc ──

export function createRevoluteLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  const arc = upperLimit - lowerLimit;
  if (arc <= 0) return null;

  const root = new Group();
  root.name = 'limit-visual-revolute';

  // TorusGeometry(radius, tube, radialSegments, tubularSegments, arc)
  const geometry = new TorusGeometry(
    ARC_RADIUS,
    ARC_TUBE,
    ARC_RADIAL_SEGMENTS,
    ARC_TUBULAR_SEGMENTS,
    arc,
  );
  const material = makeLimitMaterial();
  const mesh = new Mesh(geometry, material);
  // Rotate so the arc starts at lowerLimit around the Z-axis
  // TorusGeometry arc starts along +X in the XY plane; we need to rotate
  // to align with the joint Z-axis. Torus lies in XY plane by default.
  mesh.rotation.z = lowerLimit;
  mesh.userData.isPickable = false;
  mesh.renderOrder = 1;
  root.add(mesh);

  const markerGeometry = new BufferGeometry().setFromPoints([
    new Vector3(0, 0, 0),
    new Vector3(REVOLUTE_MARKER_RADIUS, 0, 0),
  ]);
  const marker = new Line(markerGeometry, makeMarkerLineMaterial());
  marker.userData.isPickable = false;
  marker.visible = false;
  marker.renderOrder = 2;
  root.add(marker);

  const meshes = [mesh];

  return {
    rootNode: root,
    meshes,
    update(currentValue: number | null) {
      marker.visible = currentValue !== null;
      if (currentValue === null) return;
      marker.rotation.z = Math.min(Math.max(currentValue, lowerLimit), upperLimit);
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
      marker.geometry.dispose();
      (marker.material as LineBasicMaterial).dispose();
    },
  };
}

// ── Prismatic limit: thin cylinder band along Z-axis ──

export function createPrismaticLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  const length = upperLimit - lowerLimit;
  if (length <= 0) return null;

  const root = new Group();
  root.name = 'limit-visual-prismatic';

  const geometry = new CylinderGeometry(
    BAND_RADIUS,
    BAND_RADIUS,
    length,
    BAND_RADIAL_SEGMENTS,
  );
  const material = makeLimitMaterial();
  const mesh = new Mesh(geometry, material);
  // CylinderGeometry is along Y by default; rotate to align with Z
  mesh.rotation.x = Math.PI / 2;
  // Position center of band at midpoint between lower and upper
  mesh.position.z = (lowerLimit + upperLimit) / 2;
  mesh.userData.isPickable = false;
  mesh.renderOrder = 1;
  root.add(mesh);

  const marker = new Mesh(
    new SphereGeometry(PRISMATIC_MARKER_RADIUS, PRISMATIC_MARKER_SEGMENTS, PRISMATIC_MARKER_SEGMENTS),
    makeMarkerMaterial(),
  );
  marker.userData.isPickable = false;
  marker.visible = false;
  marker.renderOrder = 2;
  root.add(marker);

  const meshes = [mesh];

  return {
    rootNode: root,
    meshes,
    update(currentValue: number | null) {
      marker.visible = currentValue !== null;
      if (currentValue === null) return;
      marker.position.set(0, 0, Math.min(Math.max(currentValue, lowerLimit), upperLimit));
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
      marker.geometry.dispose();
      (marker.material as MeshBasicMaterial).dispose();
    },
  };
}

// ── Cylindrical limit: combine revolute arc + prismatic band ──

export function createCylindricalLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  // For cylindrical joints, limits typically apply to the translational DOF.
  // We show a prismatic band for now; revolute portion is unbounded.
  return createPrismaticLimitVisual(lowerLimit, upperLimit);
}

// ── Factory dispatcher ──

export function createLimitVisual(
  jointType: string,
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  switch (jointType) {
    case 'revolute':
      return createRevoluteLimitVisual(lowerLimit, upperLimit);
    case 'prismatic':
      return createPrismaticLimitVisual(lowerLimit, upperLimit);
    case 'cylindrical':
      return createCylindricalLimitVisual(lowerLimit, upperLimit);
    default:
      return null;
  }
}
