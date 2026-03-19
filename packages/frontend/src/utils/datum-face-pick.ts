export type DatumFacePickResolution =
  | { kind: 'create'; bodyId: string; faceIndex: number }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

export function resolveDatumFacePick(
  entityId: string | null,
  bodies: Map<string, unknown>,
  spatial?: { faceIndex?: number },
): DatumFacePickResolution {
  if (!entityId || !bodies.has(entityId)) {
    return { kind: 'ignore' };
  }

  if (spatial?.faceIndex === undefined) {
    return {
      kind: 'error',
      message: 'Face-aware datum creation unavailable for this pick',
    };
  }

  return {
    kind: 'create',
    bodyId: entityId,
    faceIndex: spatial.faceIndex,
  };
}
