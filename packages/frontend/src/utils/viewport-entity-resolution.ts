import { DETACHED_BODY_PREFIX } from '../engine/connection.js';
import type { BodyState, GeometryState } from '../stores/mechanism.js';

export function resolveViewportEntityId(
  entityId: string | null,
  bodies: Map<string, BodyState>,
  geometries: Map<string, GeometryState>,
): string | null {
  if (entityId == null) {
    return null;
  }

  // Resolve synthetic detached body IDs → geometry ID
  if (entityId.startsWith(DETACHED_BODY_PREFIX)) {
    const geomId = entityId.slice(DETACHED_BODY_PREFIX.length);
    return geometries.has(geomId) ? entityId : null;
  }

  const geometry = geometries.get(entityId);
  if (geometry) {
    // Detached geometry → use its synthetic body ID
    if (!geometry.parentBodyId) {
      return `${DETACHED_BODY_PREFIX}${entityId}`;
    }
    return geometry.parentBodyId;
  }

  return bodies.has(entityId) ? entityId : entityId;
}

export function resolveViewportEntityIds(
  entityIds: Set<string>,
  bodies: Map<string, BodyState>,
  geometries: Map<string, GeometryState>,
): Set<string> {
  const resolved = new Set<string>();
  for (const entityId of entityIds) {
    const viewportId = resolveViewportEntityId(entityId, bodies, geometries);
    if (viewportId != null) {
      resolved.add(viewportId);
    }
  }
  return resolved;
}
