import type { BodyState, GeometryState } from '../stores/mechanism.js';

export function resolveViewportEntityId(
  entityId: string | null,
  bodies: Map<string, BodyState>,
  geometries: Map<string, GeometryState>,
): string | null {
  if (entityId == null) {
    return null;
  }

  const geometry = geometries.get(entityId);
  if (geometry) {
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
