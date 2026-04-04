/**
 * Screen-space label layout algorithm.
 *
 * Greedy compass placement: for each label, try 8 offset directions from the
 * anchor point and pick the position with the least overlap. Deterministic
 * (no jitter during camera orbit) and cheap (O(n^2), sub-ms for typical
 * label counts of 10-30).
 */

// ── Types ──

export interface ScreenLabel {
  entityId: string;
  entityType: 'body' | 'joint';
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  /** Screen-space radius of the entity's visual extent (px). */
  screenRadius: number;
  isSelected: boolean;
  isHovered: boolean;
}

export interface PlacedLabel {
  entityId: string;
  /** Label center X in screen pixels. */
  x: number;
  /** Label center Y in screen pixels. */
  y: number;
  visible: boolean;
}

export interface LayoutResult {
  placed: PlacedLabel[];
  culledCount: number;
}

// ── Constants ──

/** Minimum offset radius from anchor to label center (px). */
const MIN_OFFSET = 28;
/** Extra padding beyond the entity's screen radius (px). */
const RADIUS_PAD = 16;

/** 8 compass directions as unit vectors [dx, dy]. Y points downward in screen space. */
const COMPASS: ReadonlyArray<[number, number]> = [
  [0, -1],    // N  (above — preferred)
  [0.707, -0.707],  // NE
  [-0.707, -0.707], // NW
  [1, 0],     // E
  [-1, 0],    // W
  [0.707, 0.707],   // SE
  [-0.707, 0.707],  // SW
  [0, 1],     // S  (below — least preferred)
];

/** Preference bonus for "above" directions (N, NE, NW). */
const ABOVE_BONUS = -2;
/** Penalty per pixel of overlap with an already-placed label. */
const OVERLAP_PENALTY_PER_PX = 0.02;
/** Penalty for clipping the viewport edge. */
const EDGE_CLIP_PENALTY = 15;
/** Score threshold above which a low-priority label gets culled. */
const CULL_THRESHOLD = 10;
/** Maximum labels to show before culling. */
const MAX_VISIBLE = 40;

// ── Helpers ──

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function labelRect(cx: number, cy: number, w: number, h: number): Rect {
  const hw = w / 2;
  const hh = h / 2;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

function overlapArea(a: Rect, b: Rect): number {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function priority(label: ScreenLabel): number {
  let p = 0;
  if (label.isSelected) p += 100;
  // NOTE: isHovered intentionally excluded from layout priority.
  // Including it causes hover oscillation: hover → priority shift → label
  // moves → pointerleave → unhover → label moves back → repeat.
  // Hover feedback is purely visual (CSS styling in the overlay).
  if (label.entityType === 'body') p += 10;
  return p;
}

// ── Main algorithm ──

export function computeLabelLayout(
  labels: ScreenLabel[],
  viewportWidth: number,
  viewportHeight: number,
): LayoutResult {
  // Sort descending by priority (selected > hovered > body > joint).
  const sorted = labels.slice().sort((a, b) => priority(b) - priority(a));

  const placedRects: Rect[] = [];
  const placed: PlacedLabel[] = [];
  let culledCount = 0;

  for (const label of sorted) {
    // If we've hit the visible cap, cull low-priority labels.
    if (placedRects.length >= MAX_VISIBLE) {
      placed.push({ entityId: label.entityId, x: 0, y: 0, visible: false });
      culledCount++;
      continue;
    }

    // Offset must clear the entity's visual extent so labels sit outside geometry.
    const offset = Math.max(MIN_OFFSET, label.screenRadius + RADIUS_PAD);

    let bestScore = Infinity;
    let bestX = label.anchorX;
    let bestY = label.anchorY - offset;

    for (let i = 0; i < COMPASS.length; i++) {
      const [dx, dy] = COMPASS[i];
      const cx = label.anchorX + dx * offset;
      const cy = label.anchorY + dy * offset;
      const rect = labelRect(cx, cy, label.width, label.height);

      let score = 0;

      // "Above" preference
      if (i <= 2) score += ABOVE_BONUS;

      // Viewport edge clipping
      if (rect.left < 0 || rect.top < 0 || rect.right > viewportWidth || rect.bottom > viewportHeight) {
        score += EDGE_CLIP_PENALTY;
      }

      // Overlap with already-placed labels
      for (const pr of placedRects) {
        const area = overlapArea(rect, pr);
        if (area > 0) {
          score += area * OVERLAP_PENALTY_PER_PX;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestX = cx;
        bestY = cy;
      }
    }

    // Cull if best placement is too bad and label is low-priority.
    if (bestScore > CULL_THRESHOLD && !label.isSelected && !label.isHovered) {
      placed.push({ entityId: label.entityId, x: 0, y: 0, visible: false });
      culledCount++;
      continue;
    }

    placedRects.push(labelRect(bestX, bestY, label.width, label.height));
    placed.push({ entityId: label.entityId, x: bestX, y: bestY, visible: true });
  }

  return { placed, culledCount };
}
