import type { JointTypeId } from '../stores/mechanism.js';
import type { DatumPreviewType } from '@motionlab/viewport';

export type InferenceConfidence = 'high' | 'medium' | 'low';

export interface JointFrameProposal {
  /** Recommended joint types for this surface, best first. */
  recommendedTypes: JointTypeId[];
  /** How confident the inference is — 'high' enables auto-commit. */
  confidence: InferenceConfidence;
  /** Human-readable label for the tooltip. */
  label: string;
}

/**
 * Infer a joint frame proposal from a single face pick's surface classification.
 *
 * This maps the surface type (from B-Rep analysis or viewport estimation) to
 * joint types that would naturally fit:
 * - Cylindrical face → revolute/cylindrical/prismatic (high confidence)
 * - Planar face → fixed/planar (medium confidence)
 * - Spherical face → spherical (medium confidence)
 * - Other → general types (low confidence)
 */
export function inferJointFrame(
  surfaceClass: 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'toroidal' | 'other' | undefined,
  previewType: DatumPreviewType | undefined,
): JointFrameProposal {
  // Prefer engine surface class (from B-Rep) when available
  if (surfaceClass) {
    switch (surfaceClass) {
      case 'cylindrical':
        return {
          recommendedTypes: ['revolute', 'cylindrical', 'prismatic'],
          confidence: 'high',
          label: 'Revolute axis',
        };
      case 'planar':
        return {
          recommendedTypes: ['fixed', 'planar'],
          confidence: 'medium',
          label: 'Joint plane',
        };
      case 'spherical':
        return {
          recommendedTypes: ['spherical', 'revolute', 'fixed'],
          confidence: 'medium',
          label: 'Joint point',
        };
      case 'conical':
        return {
          recommendedTypes: ['revolute', 'cylindrical'],
          confidence: 'medium',
          label: 'Revolute axis',
        };
      case 'toroidal':
        return {
          recommendedTypes: ['revolute'],
          confidence: 'medium',
          label: 'Revolute axis',
        };
      case 'other':
        return {
          recommendedTypes: ['fixed', 'revolute', 'prismatic', 'spherical'],
          confidence: 'low',
          label: 'Joint point',
        };
    }
  }

  // Fall back to viewport-estimated preview type
  if (previewType) {
    switch (previewType) {
      case 'axis':
        return {
          recommendedTypes: ['revolute', 'cylindrical', 'prismatic'],
          confidence: 'medium',
          label: 'Revolute axis',
        };
      case 'plane':
        return {
          recommendedTypes: ['fixed', 'planar'],
          confidence: 'medium',
          label: 'Joint plane',
        };
      case 'point':
        return {
          recommendedTypes: ['spherical', 'revolute', 'fixed'],
          confidence: 'low',
          label: 'Joint point',
        };
    }
  }

  return {
    recommendedTypes: ['fixed', 'revolute', 'prismatic', 'spherical', 'cylindrical', 'planar'],
    confidence: 'low',
    label: 'Joint anchor',
  };
}

export type PairSurfaceClass = 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'toroidal' | 'other' | null | undefined;

/**
 * Determine whether a pair of face picks should auto-commit (skip the type selector).
 *
 * Auto-commit fires only when both picks are high-confidence and the datum alignment
 * confirms the geometric relationship. Currently: two cylindrical faces with coaxial
 * alignment → revolute.
 */
export function shouldAutoCommit(
  parentSurfaceClass: PairSurfaceClass,
  childSurfaceClass: PairSurfaceClass,
  alignmentKind: 'coaxial' | 'coplanar' | 'coincident' | 'general' | null,
): { autoCommit: boolean; jointType: JointTypeId | null } {
  // Two cylindrical faces, coaxial alignment → revolute
  if (
    parentSurfaceClass === 'cylindrical' &&
    childSurfaceClass === 'cylindrical' &&
    alignmentKind === 'coaxial'
  ) {
    return { autoCommit: true, jointType: 'revolute' };
  }

  return { autoCommit: false, jointType: null };
}
