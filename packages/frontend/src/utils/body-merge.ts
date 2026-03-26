import {
  sendAttachGeometry,
  sendCreateBody,
  sendDeleteBody,
  sendDetachGeometry,
} from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useToastStore } from '../stores/toast.js';

/* ── Name inference ── */

/**
 * Infer a body name from the selected entity names.
 *
 * If the names share a common prefix of 3+ chars (trimmed at the last
 * separator), returns that prefix in title case + " Body".
 * Otherwise returns "Body N".
 */
export function inferBodyName(entityIds: string[]): string {
  const mech = useMechanismStore.getState();
  const names: string[] = [];

  for (const id of entityIds) {
    const body = mech.bodies.get(id);
    if (body) {
      names.push(body.name);
      continue;
    }
    const geom = mech.geometries.get(id);
    if (geom) {
      names.push(geom.name);
    }
  }

  if (names.length === 0) return `Body ${mech.bodies.size + 1}`;

  const prefix = longestCommonPrefix(names);
  if (prefix.length >= 3) {
    return `${titleCase(prefix)} Body`;
  }

  return `Body ${mech.bodies.size + 1}`;
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0]!;
  for (let i = 1; i < strings.length; i++) {
    while (strings[i]!.indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  // Trim to last separator boundary
  const separators = /[_\- ]/;
  let trimmed = prefix;
  // Walk backwards to find last separator
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (separators.test(trimmed[i]!)) {
      trimmed = trimmed.slice(0, i);
      break;
    }
    if (i === 0) {
      // No separator found — use full prefix only if it equals all names
      // (i.e., all names are identical). Otherwise it's a partial word match.
      const allIdentical = strings.every((s) => s === prefix);
      if (!allIdentical) trimmed = '';
    }
  }
  return trimmed;
}

function titleCase(s: string): string {
  return s
    .replace(/[_\-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ── Selection resolution ── */

export interface ResolvedSelection {
  /** Flat list of geometry IDs that should end up in the new body. */
  geometryIds: string[];
  /** Body IDs that were selected and should be dissolved after merge. */
  bodiesToDissolve: string[];
}

/**
 * Resolve a raw selection (mix of body and geometry IDs) into a flat
 * list of geometry IDs and a list of bodies to dissolve.
 */
export function resolveGeometryIds(selectedIds: Set<string>): ResolvedSelection {
  const mech = useMechanismStore.getState();
  const geometryIdSet = new Set<string>();
  const bodiesToDissolve: string[] = [];

  for (const id of selectedIds) {
    if (mech.bodies.has(id)) {
      bodiesToDissolve.push(id);
      // Collect all child geometries of this body
      for (const [gId, g] of mech.geometries) {
        if (g.parentBodyId === id) {
          geometryIdSet.add(gId);
        }
      }
    } else if (mech.geometries.has(id)) {
      geometryIdSet.add(id);
    }
  }

  return { geometryIds: [...geometryIdSet], bodiesToDissolve };
}

/* ── Make Body (merge) ── */

/**
 * Create a new body from the current selection.
 *
 * Handles mixed selections (bodies + geometries), auto-detaches
 * geometries from existing bodies, and triggers inline rename.
 */
export function executeMakeBody(selectedIds: Set<string>): void {
  const { geometryIds, bodiesToDissolve } = resolveGeometryIds(selectedIds);
  if (geometryIds.length === 0) return;

  const mech = useMechanismStore.getState();
  const name = inferBodyName([...selectedIds]);

  // Detach geometries that already belong to a body
  for (const geomId of geometryIds) {
    const geom = mech.geometries.get(geomId);
    if (geom?.parentBodyId) {
      sendDetachGeometry(geomId);
    }
  }

  // Set up the pending workflow so the createBodyResult handler
  // can attach geometries and clean up dissolved bodies
  mech.setPendingMakeBodyGeometries(geometryIds);
  mech.setPendingMakeBodyOptions({
    name,
    bodiesToDissolve,
    shouldActivateRename: true,
  });

  sendCreateBody(name);
}

/* ── Detach geometry ── */

/**
 * Detach a single geometry from its parent body.
 */
export function executeDetachGeometry(geometryId: string): void {
  const mech = useMechanismStore.getState();
  const geom = mech.geometries.get(geometryId);
  if (!geom?.parentBodyId) return;

  const parentBody = mech.bodies.get(geom.parentBodyId);
  sendDetachGeometry(geometryId);

  useSelectionStore.getState().select(geometryId);
  useToastStore.getState().addToast({
    variant: 'success',
    title: 'Detached',
    description: parentBody
      ? `${geom.name} removed from ${parentBody.name}`
      : geom.name,
    duration: 3000,
  });
}

/* ── Split body ── */

/**
 * Split selected geometries out of their parent body into a new body.
 *
 * All selected geometry IDs must belong to the same source body,
 * and the selection must not include all of the body's children
 * (that would be a move, not a split).
 */
export function executeSplitBody(
  selectedGeometryIds: Set<string>,
  sourceBodyId: string,
): void {
  const mech = useMechanismStore.getState();

  // Validate: all selected geometries belong to sourceBodyId
  const validIds: string[] = [];
  for (const id of selectedGeometryIds) {
    const geom = mech.geometries.get(id);
    if (geom?.parentBodyId === sourceBodyId) {
      validIds.push(id);
    }
  }
  if (validIds.length === 0) return;

  const name = inferBodyName(validIds);

  // Detach each geometry from the source body
  for (const geomId of validIds) {
    sendDetachGeometry(geomId);
  }

  // Set up pending workflow for the new body
  mech.setPendingMakeBodyGeometries(validIds);
  mech.setPendingMakeBodyOptions({
    name,
    bodiesToDissolve: [],
    shouldActivateRename: true,
  });

  sendCreateBody(name);
}
