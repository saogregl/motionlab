declare module 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js' {
  import type { BufferGeometry } from 'three';
  import type { MeshBVH } from 'three-mesh-bvh';

  export class GenerateMeshBVHWorker {
    constructor();
    generate(geometry: BufferGeometry, options?: unknown): Promise<MeshBVH>;
    dispose(): void;
  }
}
