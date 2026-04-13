/**
 * STEP file loader using occt-import-js (WASM).
 *
 * Provides browser-side STEP/IGES import + tessellation with B-Rep face
 * topology (partIndex). Intended for Storybook stories, tests, and standalone
 * demos — in production the native C++ engine is authoritative for geometry.
 */

import type { OcctBrepFace, OcctImporter, OcctImportMesh, OcctImportParams } from 'occt-import-js';

import type { MeshDataInput } from '../scene-graph-three.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StepBodyData {
  readonly name: string;
  readonly color: [number, number, number];
  readonly mesh: MeshDataInput;
  readonly partIndex: Uint32Array;
}

export interface StepLoadResult {
  readonly bodies: StepBodyData[];
  readonly rootName: string;
}

const DEFAULT_STEP_IMPORT_PARAMS: OcctImportParams = {
  // Match the native engine import contract: viewport story geometry should
  // arrive in meters, regardless of the source STEP file units.
  linearUnit: 'meter',
};

// ---------------------------------------------------------------------------
// WASM singleton
// ---------------------------------------------------------------------------

let importerPromise: Promise<OcctImporter> | null = null;

/**
 * Default WASM base path — serves from Storybook's static dir.
 * Override via `setWasmBasePath()` if hosting the WASM file elsewhere.
 */
interface WasmBasePathRuntimeOptions {
  readonly isDev: boolean;
  readonly moduleUrl: string;
}

/**
 * Resolve the default OCCT WASM base path for the current runtime.
 *
 * Dev keeps an absolute `/occt-wasm/` path because Storybook/Vite expose that
 * mount directly. Production uses a URL relative to the emitted JS chunk so
 * packaged `file://` installs resolve inside the app bundle.
 */
export function resolveDefaultWasmBasePath(options: WasmBasePathRuntimeOptions): string {
  if (options.isDev) {
    return '/occt-wasm/';
  }
  return new URL('../occt-wasm/', options.moduleUrl).href;
}

const runtimeEnv = import.meta as ImportMeta & {
  readonly env?: {
    readonly DEV?: boolean;
  };
};

let wasmBasePath = resolveDefaultWasmBasePath({
  isDev: runtimeEnv.env?.DEV === true,
  moduleUrl: import.meta.url,
});

export function setWasmBasePath(path: string): void {
  if (!path.endsWith('/')) path += '/';
  wasmBasePath = path;
  // Reset singleton so next call uses the new path
  importerPromise = null;
}

function getImporter(): Promise<OcctImporter> {
  if (!importerPromise) {
    importerPromise = (async () => {
      // Dynamic import so the ~5MB WASM is only fetched when needed
      const initOcct = (await import('occt-import-js')).default;
      return initOcct({
        locateFile: (path: string) => wasmBasePath + path,
      });
    })();
  }
  return importerPromise;
}

// ---------------------------------------------------------------------------
// Pure conversion helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Convert occt-import-js `brep_faces` array to a partIndex (triangle count
 * per B-Rep face). Each entry is `last - first + 1`.
 */
export function brepFacesToPartIndex(brepFaces: OcctBrepFace[]): Uint32Array {
  const partIndex = new Uint32Array(brepFaces.length);
  for (let i = 0; i < brepFaces.length; i++) {
    partIndex[i] = brepFaces[i].last - brepFaces[i].first + 1;
  }
  return partIndex;
}

/**
 * Convert a single occt-import-js mesh to MotionLab MeshDataInput + partIndex.
 */
export function convertOcctMesh(mesh: OcctImportMesh): {
  meshData: MeshDataInput;
  partIndex: Uint32Array;
} {
  const meshData: MeshDataInput = {
    vertices: new Float32Array(mesh.attributes.position.array),
    normals: new Float32Array(mesh.attributes.normal.array),
    indices: new Uint32Array(mesh.index.array),
  };

  const partIndex = brepFacesToPartIndex(mesh.brep_faces);

  // Validation: sum of partIndex must equal total triangle count
  const totalTriangles = meshData.indices.length / 3;
  let partSum = 0;
  for (const count of partIndex) {
    partSum += count;
  }
  if (partSum !== totalTriangles) {
    console.warn(
      `[step-loader] partIndex sum (${partSum}) !== triangle count (${totalTriangles}) for mesh "${mesh.name}"`,
    );
  }

  return { meshData, partIndex };
}

export function normalizeStepImportParams(params?: OcctImportParams | null): OcctImportParams {
  return {
    ...DEFAULT_STEP_IMPORT_PARAMS,
    ...(params ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and tessellate a STEP file from a URL.
 *
 * Returns one StepBodyData per solid/shell in the assembly. Each body includes
 * tessellated mesh data and a partIndex for face-level topology. Mesh vertices
 * are normalized to meters to mirror the native import path.
 */
export async function loadSTEP(url: string, params?: OcctImportParams): Promise<StepLoadResult> {
  const [importer, buffer] = await Promise.all([
    getImporter(),
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch STEP file: ${r.status} ${r.statusText}`);
      return r.arrayBuffer();
    }),
  ]);

  const fileBuffer = new Uint8Array(buffer);
  const result = importer.ReadStepFile(fileBuffer, normalizeStepImportParams(params));

  if (!result.success) {
    throw new Error('occt-import-js failed to read STEP file');
  }

  const bodies: StepBodyData[] = [];

  for (let i = 0; i < result.meshes.length; i++) {
    const mesh = result.meshes[i];
    if (!mesh.index.array.length) continue;

    const { meshData, partIndex } = convertOcctMesh(mesh);

    bodies.push({
      name: mesh.name || `Body ${i + 1}`,
      color: mesh.color,
      mesh: meshData,
      partIndex,
    });
  }

  return {
    bodies,
    rootName: result.root.name || 'Assembly',
  };
}
