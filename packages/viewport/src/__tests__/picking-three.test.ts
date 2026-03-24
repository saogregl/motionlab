import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
} from 'three';
import type { Intersection, WebGLRenderer } from 'three';

import { PickingManager } from '../picking-three.js';
import type { SceneGraphManager } from '../scene-graph-three.js';

class FakeDomElement {
  private listeners = new Map<string, Set<(event: PointerEvent) => void>>();

  addEventListener(type: string, listener: (event: PointerEvent) => void): void {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: PointerEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, init: Partial<PointerEvent>): void {
    const event = {
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...init,
    } as PointerEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

function makePickMesh(entityId: string): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2]);
  return new Mesh(geometry, new MeshBasicMaterial({ color: 0xffffff }));
}

function makeSceneGraph(mesh: Mesh): SceneGraphManager {
  mesh.userData = { entityId: 'body-1', entityType: 'body' };
  return {
    onEntityListChanged: () => () => {},
    getAllPickableMeshes: () => [mesh],
    hasPendingBodyBvhs: () => false,
    getBodyGeometryIndex: () => undefined,
    clearAllFaceHighlights: () => {},
    clearDatumPreview: () => {},
    showDatumPreview: () => {},
    getBodyFacePreview: () => null,
    highlightFace: () => {},
  } as unknown as SceneGraphManager;
}

function flushAnimationFrames(): void {
  flushAnimationFramesAt(0);
}

function flushAnimationFramesAt(timestampMs: number): void {
  const queued = Array.from(animationFrames.entries());
  animationFrames.clear();
  for (const [, callback] of queued) {
    callback(timestampMs);
  }
}

let nextAnimationFrameId = 1;
let animationFrames = new Map<number, FrameRequestCallback>();

describe('PickingManager', () => {
  beforeEach(() => {
    nextAnimationFrameId = 1;
    animationFrames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId++;
      animationFrames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrames.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats short pointer movement as a click pick', () => {
    const domElement = new FakeDomElement();
    const mesh = makePickMesh('body-1');
    const sceneGraph = makeSceneGraph(mesh);
    const onPick = vi.fn();
    const onHover = vi.fn();
    const picking = new PickingManager(
      { domElement } as unknown as WebGLRenderer,
      new OrthographicCamera(-1, 1, 1, -1, -10, 10),
      new Scene(),
      sceneGraph,
      onPick,
      onHover,
    );

    const hit = {
      object: mesh,
      point: new Vector3(0, 0, 0),
      face: { normal: new Vector3(0, 0, 1) },
      faceIndex: 0,
    } as unknown as Intersection;
    const raycaster = (picking as unknown as {
      raycaster: { intersectObjects: (...args: unknown[]) => unknown };
    }).raycaster;
    vi.spyOn(raycaster, 'intersectObjects').mockImplementation((...args: unknown[]) => {
      const target = args[2] as Intersection[];
      target.push(hit);
      return target;
    });

    domElement.dispatch('pointerdown', { clientX: 10, clientY: 10 });
    domElement.dispatch('pointerup', { clientX: 12, clientY: 12 });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toBe('body-1');
    expect(onPick.mock.calls[0]?.[1]).toEqual({ ctrl: false, shift: false });

    picking.dispose();
  });

  it('configures the raycaster for first-hit-only queries', () => {
    const domElement = new FakeDomElement();
    const mesh = makePickMesh('body-1');
    const sceneGraph = makeSceneGraph(mesh);
    const picking = new PickingManager(
      { domElement } as unknown as WebGLRenderer,
      new OrthographicCamera(-1, 1, 1, -1, -10, 10),
      new Scene(),
      sceneGraph,
      vi.fn(),
      vi.fn(),
    );

    const raycaster = (picking as unknown as {
      raycaster: { firstHitOnly?: boolean };
    }).raycaster;

    expect(raycaster.firstHitOnly).toBe(true);

    picking.dispose();
  });

  it('suppresses hover raycasts during pointer drags and resumes after release', () => {
    const domElement = new FakeDomElement();
    const mesh = makePickMesh('body-1');
    const sceneGraph = makeSceneGraph(mesh);
    const onPick = vi.fn();
    const onHover = vi.fn();
    const picking = new PickingManager(
      { domElement } as unknown as WebGLRenderer,
      new OrthographicCamera(-1, 1, 1, -1, -10, 10),
      new Scene(),
      sceneGraph,
      onPick,
      onHover,
    );

    const hit = {
      object: mesh,
      point: new Vector3(0, 0, 0),
      face: { normal: new Vector3(0, 0, 1) },
      faceIndex: 0,
    } as unknown as Intersection;
    const raycaster = (picking as unknown as {
      raycaster: { intersectObjects: (...args: unknown[]) => unknown };
    }).raycaster;
    const intersectSpy = vi.spyOn(raycaster, 'intersectObjects').mockImplementation((...args: unknown[]) => {
      const target = args[2] as Intersection[];
      target.push(hit);
      return target;
    });

    domElement.dispatch('pointerdown', { clientX: 10, clientY: 10 });
    domElement.dispatch('pointermove', { clientX: 30, clientY: 30 });
    flushAnimationFrames();

    expect(intersectSpy).not.toHaveBeenCalled();

    domElement.dispatch('pointerup', { clientX: 30, clientY: 30 });
    flushAnimationFrames();

    expect(intersectSpy).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith('body-1');
    expect(onPick).not.toHaveBeenCalled();

    picking.dispose();
  });

  it('suppresses hover while orbit controls are dragging', () => {
    const domElement = new FakeDomElement();
    const mesh = makePickMesh('body-1');
    const sceneGraph = makeSceneGraph(mesh);
    const onPick = vi.fn();
    const onHover = vi.fn();
    const picking = new PickingManager(
      { domElement } as unknown as WebGLRenderer,
      new OrthographicCamera(-1, 1, 1, -1, -10, 10),
      new Scene(),
      sceneGraph,
      onPick,
      onHover,
    );

    const hit = {
      object: mesh,
      point: new Vector3(0, 0, 0),
      face: { normal: new Vector3(0, 0, 1) },
      faceIndex: 0,
    } as unknown as Intersection;
    const raycaster = (picking as unknown as {
      raycaster: { intersectObjects: (...args: unknown[]) => unknown };
    }).raycaster;
    const intersectSpy = vi.spyOn(raycaster, 'intersectObjects').mockImplementation((...args: unknown[]) => {
      const target = args[2] as Intersection[];
      target.push(hit);
      return target;
    });

    picking.setOrbitDragging(true);
    domElement.dispatch('pointermove', { clientX: 20, clientY: 20 });
    flushAnimationFrames();

    expect(intersectSpy).not.toHaveBeenCalled();

    picking.setOrbitDragging(false);
    flushAnimationFrames();

    expect(intersectSpy).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith('body-1');

    picking.dispose();
  });

  it('rate-limits select-mode hover raycasts', () => {
    const domElement = new FakeDomElement();
    const mesh = makePickMesh('body-1');
    const sceneGraph = makeSceneGraph(mesh);
    const onHover = vi.fn();
    const picking = new PickingManager(
      { domElement } as unknown as WebGLRenderer,
      new OrthographicCamera(-1, 1, 1, -1, -10, 10),
      new Scene(),
      sceneGraph,
      vi.fn(),
      onHover,
    );

    const hit = {
      object: mesh,
      point: new Vector3(0, 0, 0),
      face: { normal: new Vector3(0, 0, 1) },
      faceIndex: 0,
    } as unknown as Intersection;
    const raycaster = (picking as unknown as {
      raycaster: { intersectObjects: (...args: unknown[]) => unknown };
    }).raycaster;
    const intersectSpy = vi.spyOn(raycaster, 'intersectObjects').mockImplementation((...args: unknown[]) => {
      const target = args[2] as Intersection[];
      target.push(hit);
      return target;
    });

    domElement.dispatch('pointermove', { clientX: 20, clientY: 20 });
    flushAnimationFramesAt(0);
    expect(intersectSpy).toHaveBeenCalledTimes(1);

    domElement.dispatch('pointermove', { clientX: 22, clientY: 22 });
    flushAnimationFramesAt(10);
    expect(intersectSpy).toHaveBeenCalledTimes(1);

    flushAnimationFramesAt(40);
    expect(intersectSpy).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenCalledWith('body-1');

    picking.dispose();
  });
});
