import { sendDetachGeometry, sendMakeCompoundBody, sendSplitBody } from '../engine/connection.js';
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
    .replace(/[_-]/g, ' ')
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

function resolveSelectedEntityBodyId(id: string): string | undefined {
  const mech = useMechanismStore.getState();
  if (mech.bodies.has(id)) {
    return id;
  }
  const geom = mech.geometries.get(id);
  return geom?.parentBodyId ?? undefined;
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

/**
 * Resolve the body frame that should be preserved when creating a compound
 * body. Prefer the last-selected entity's body, then fall back to the first
 * selected body-bearing entity.
 */
export function resolveMakeBodyReferenceBodyId(selectedIds: Set<string>): string | undefined {
  const { lastSelectedId } = useSelectionStore.getState();
  if (lastSelectedId && selectedIds.has(lastSelectedId)) {
    const lastSelectedBodyId = resolveSelectedEntityBodyId(lastSelectedId);
    if (lastSelectedBodyId) {
      return lastSelectedBodyId;
    }
  }

  for (const id of selectedIds) {
    const bodyId = resolveSelectedEntityBodyId(id);
    if (bodyId) {
      return bodyId;
    }
  }

  return undefined;
}

/* ── Make Body (merge) ── */

/**
 * Create a new body from the current selection.
 *
 * Sends a single atomic MakeCompoundBody command to the engine which
 * handles detach, body creation, attach with world-position-preserving
 * local poses, datum re-parenting, and dissolution of empty source bodies.
 */
export function executeMakeBody(selectedIds: Set<string>): void {
  console.debug('[make-body] selectedIds:', [...selectedIds]);
  const mech = useMechanismStore.getState();
  const { geometryIds } = resolveGeometryIds(selectedIds);
  const referenceBodyId = resolveMakeBodyReferenceBodyId(selectedIds);
  console.debug('[make-body] resolved geometryIds:', geometryIds);
  if (geometryIds.length === 0) {
    console.warn('[make-body] no geometry IDs resolved — aborting');
    return;
  }

  // Preserve fixed status: if any source body is fixed, the compound body is fixed
  let motionType: 'dynamic' | 'fixed' = 'dynamic';
  for (const gId of geometryIds) {
    const geom = mech.geometries.get(gId);
    if (geom?.parentBodyId) {
      const body = mech.bodies.get(geom.parentBodyId);
      if (body?.motionType === 'fixed') {
        motionType = 'fixed';
      }
    }
  }

  const name = inferBodyName([...selectedIds]);
  console.debug('[make-body] sending MakeCompoundBody command:', {
    name,
    geometryIds,
    motionType,
    originMode: referenceBodyId ? 'preserveFrame' : 'worldCenterOfMass',
    referenceBodyId,
  });
  sendMakeCompoundBody(geometryIds, name, {
    motionType,
    dissolveEmptyBodies: true,
    referenceBodyId,
  });
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
    description: parentBody ? `${geom.name} removed from ${parentBody.name}` : geom.name,
    duration: 3000,
  });
}

/* ── Split body ── */

/**
 * Split selected geometries out of their parent body into a new body.
 *
 * Sends a single atomic SplitBody command to the engine which handles
 * detach, body creation at centroid, and attach with world-position-
 * preserving local poses.
 */
export function executeSplitBody(selectedGeometryIds: Set<string>, sourceBodyId: string): void {
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
  sendSplitBody(sourceBodyId, validIds, name);
}
