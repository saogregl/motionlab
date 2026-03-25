export type DatumFacePickResolution =
  | { kind: 'create'; bodyId: string; geometryId: string; faceIndex: number }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

export function resolveDatumFacePick(
  entityId: string | null,
  bodies: Map<string, unknown>,
  spatial?: { bodyId?: string; geometryId?: string; faceIndex?: number },
): DatumFacePickResolution {
  const bodyId = spatial?.bodyId ?? entityId;
  if (!bodyId || !bodies.has(bodyId)) {
    return { kind: 'ignore' };
  }

  if (!spatial?.geometryId || spatial.faceIndex === undefined) {
    return {
      kind: 'error',
      message: 'Face-aware datum creation unavailable for this pick',
    };
  }

  return {
    kind: 'create',
    bodyId,
    geometryId: spatial.geometryId,
    faceIndex: spatial.faceIndex,
  };
}
