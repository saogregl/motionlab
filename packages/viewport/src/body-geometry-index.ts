export class BodyGeometryIndex {
  readonly triangleToFace: Uint32Array;
  readonly faceRanges: ReadonlyArray<{ start: number; count: number }>;
  readonly faceCount: number;

  constructor(partIndex: Uint32Array | number[]) {
    this.faceCount = partIndex.length;

    let totalTriangles = 0;
    for (const count of partIndex) {
      totalTriangles += count;
    }
    this.triangleToFace = new Uint32Array(totalTriangles);

    const faceRanges: Array<{ start: number; count: number }> = [];
    let offset = 0;
    for (let face = 0; face < partIndex.length; face++) {
      const count = partIndex[face] ?? 0;
      faceRanges.push({ start: offset, count });
      for (let tri = 0; tri < count; tri++) {
        this.triangleToFace[offset + tri] = face;
      }
      offset += count;
    }
    this.faceRanges = faceRanges;
  }

  getFaceFromTriangle(triangleIndex: number): number {
    if (triangleIndex < 0 || triangleIndex >= this.triangleToFace.length) {
      return -1;
    }
    return this.triangleToFace[triangleIndex] ?? -1;
  }
}
