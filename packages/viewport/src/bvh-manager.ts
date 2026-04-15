/**
 * bvh-manager.ts
 *
 * Manages BVH (Bounding Volume Hierarchy) construction for body geometry
 * meshes, enabling fast raycasting for picking.  Supports both synchronous
 * builds (small meshes) and async worker-based builds (large meshes).
 */

/// <reference path="./three-mesh-bvh-worker.d.ts" />

import { BufferAttribute, BufferGeometry } from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';

import {
  type BodyBvhState,
  type BodyGeometryRenderState,
  type BodyMeta,
  isBodyEntity,
  type PendingBvhBuild,
  type SceneContext,
  type SceneEntityInternal,
} from './scene-context.js';
import { BVH_ASYNC_TRI_THRESHOLD, BVH_BUILD_OPTIONS } from './scene-graph-utils.js';

export class BvhManager {
  private bvhWorker: GenerateMeshBVHWorker | null = null;
  private bvhBuildQueue: PendingBvhBuild[] = [];
  private bvhBuildInFlight = false;
  private nextBvhBuildToken = 1;

  constructor(private readonly ctx: SceneContext) {}

  scheduleBodyBvhBuild(
    bodyId: string,
    geometryId: string,
    geometry: BufferGeometry,
    triangleCount: number,
  ): void {
    const entity = this.ctx.entities.get(bodyId);
    if (!isBodyEntity(entity)) return;
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    if (!geometryState) return;

    const buildToken = this.nextBvhBuildToken++;
    geometryState.bvhBuildToken = buildToken;
    geometryState.bvhState = 'building';

    if (triangleCount < BVH_ASYNC_TRI_THRESHOLD) {
      this.buildBodyBvhSync(bodyId, geometryId, geometry, buildToken);
      return;
    }

    const worker = this.getOrCreateBvhWorker();
    const workerGeometry = worker ? this.cloneGeometryForBvhBuild(geometry) : null;
    if (!worker || !workerGeometry) {
      this.buildBodyBvhSync(bodyId, geometryId, geometry, buildToken);
      return;
    }

    this.bvhBuildQueue.push({
      bodyId,
      geometryId,
      geometry,
      workerGeometry,
      buildToken,
    });
    void this.pumpBvhBuildQueue();
  }

  private buildBodyBvhSync(
    bodyId: string,
    geometryId: string,
    geometry: BufferGeometry,
    buildToken: number,
  ): void {
    try {
      geometry.computeBoundsTree(BVH_BUILD_OPTIONS);
      const entity = this.ctx.entities.get(bodyId);
      if (!isBodyEntity(entity)) return;
      const geometryState = this.getBodyGeometryState(entity, geometryId);
      if (!geometryState || geometryState.bvhBuildToken !== buildToken) return;
      geometryState.bvhState = 'ready';
    } catch {
      const entity = this.ctx.entities.get(bodyId);
      if (!isBodyEntity(entity)) return;
      const geometryState = this.getBodyGeometryState(entity, geometryId);
      if (!geometryState || geometryState.bvhBuildToken !== buildToken) return;
      geometryState.bvhState = 'failed';
    }
  }

  private getOrCreateBvhWorker(): GenerateMeshBVHWorker | null {
    if (typeof Worker === 'undefined') return null;
    if (!this.bvhWorker) {
      this.bvhWorker = new GenerateMeshBVHWorker();
    }
    return this.bvhWorker;
  }

  private cloneGeometryForBvhBuild(geometry: BufferGeometry): BufferGeometry | null {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    if (!(position instanceof BufferAttribute) || !index) {
      return null;
    }

    const clone = new BufferGeometry();
    const positionArray = position.array;
    const positionCopy = new Float32Array(positionArray.length);
    positionCopy.set(positionArray as ArrayLike<number>);
    clone.setAttribute(
      'position',
      new BufferAttribute(positionCopy, position.itemSize, position.normalized),
    );

    const indexArray = index.array;
    const IndexArrayCtor = indexArray.constructor as {
      new (source: ArrayLike<number>): Uint16Array | Uint32Array;
    };
    const indexCopy = new IndexArrayCtor(indexArray as ArrayLike<number>);
    clone.setIndex(new BufferAttribute(indexCopy, index.itemSize, index.normalized));
    return clone;
  }

  private async pumpBvhBuildQueue(): Promise<void> {
    if (this.bvhBuildInFlight) return;

    const next = this.bvhBuildQueue.shift();
    if (!next) return;

    const worker = this.getOrCreateBvhWorker();
    if (!worker) {
      next.workerGeometry.dispose();
      this.buildBodyBvhSync(next.bodyId, next.geometryId, next.geometry, next.buildToken);
      void this.pumpBvhBuildQueue();
      return;
    }

    this.bvhBuildInFlight = true;

    try {
      const bvh = await worker.generate(next.workerGeometry, BVH_BUILD_OPTIONS);
      const entity = this.ctx.entities.get(next.bodyId);
      const geometryState = isBodyEntity(entity)
        ? this.getBodyGeometryState(entity, next.geometryId)
        : null;
      if (
        geometryState &&
        geometryState.bvhBuildToken === next.buildToken &&
        geometryState.mesh.geometry === next.geometry
      ) {
        next.geometry.boundsTree = bvh;
        geometryState.bvhState = 'ready';
        this.ctx.requestRender();
      }
    } catch {
      const entity = this.ctx.entities.get(next.bodyId);
      const geometryState = isBodyEntity(entity)
        ? this.getBodyGeometryState(entity, next.geometryId)
        : null;
      if (geometryState && geometryState.bvhBuildToken === next.buildToken) {
        geometryState.bvhState = 'failed';
      }
    } finally {
      next.workerGeometry.dispose();
      this.bvhBuildInFlight = false;
      void this.pumpBvhBuildQueue();
    }
  }

  // ── Query methods ──

  getGeometryBvhState(bodyId: string, geometryId: string): BodyBvhState {
    const entity = this.ctx.entities.get(bodyId);
    if (!isBodyEntity(entity)) return 'none';
    return this.getBodyGeometryState(entity, geometryId)?.bvhState ?? 'none';
  }

  getBodyBvhState(id: string): BodyBvhState {
    const entity = this.ctx.entities.get(id);
    if (!isBodyEntity(entity)) return 'none';
    const primary = entity.meta.primaryGeometryId
      ? entity.meta.geometries.get(entity.meta.primaryGeometryId)
      : entity.meta.geometries.values().next().value;
    return (primary as BodyGeometryRenderState | undefined)?.bvhState ?? 'none';
  }

  hasPendingGeometryBvhs(): boolean {
    if (this.bvhBuildInFlight || this.bvhBuildQueue.length > 0) {
      return true;
    }
    for (const entity of this.ctx.entities.values()) {
      if (entity.meta.kind === 'body') {
        for (const geometry of entity.meta.geometries.values()) {
          if (geometry.bvhState === 'building') {
            return true;
          }
        }
      }
    }
    return false;
  }

  hasPendingBodyBvhs(): boolean {
    return this.hasPendingGeometryBvhs();
  }

  // ── Lifecycle ──

  clear(): void {
    this.bvhBuildQueue.length = 0;
    this.bvhWorker?.dispose();
    this.bvhWorker = null;
    this.bvhBuildInFlight = false;
  }

  dispose(): void {
    this.clear();
  }

  // ── Private helpers ──

  private getBodyGeometryState(
    entity: SceneEntityInternal & { meta: BodyMeta },
    geometryId: string,
  ): BodyGeometryRenderState | null {
    return entity.meta.geometries.get(geometryId) ?? null;
  }
}
