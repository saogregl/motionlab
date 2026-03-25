import { Color, Mesh, MeshStandardMaterial } from 'three';

import { ACCENT } from './colors-three.js';

export type MaterialPreset =
  | 'cad-default'
  | 'steel'
  | 'aluminum'
  | 'plastic-light'
  | 'plastic-dark'
  | 'rubber';

interface PresetDefinition {
  color: Color;
  metalness: number;
  roughness: number;
  envMapIntensity?: number;
}

const PRESETS: Record<MaterialPreset, PresetDefinition> = {
  'cad-default': {
    color: new Color('#8faac8'),
    metalness: 0.35,
    roughness: 0.55,
    envMapIntensity: 0.5,
  },
  steel: {
    color: new Color('#8faac8'),
    metalness: 0.5,
    roughness: 0.28,
    envMapIntensity: 0.8,
  },
  aluminum: {
    color: new Color('#a8c7e7'),
    metalness: 0.4,
    roughness: 0.35,
    envMapIntensity: 0.5,
  },
  'plastic-light': {
    color: new Color('#c0c8d0'),
    metalness: 0.0,
    roughness: 0.55,
    envMapIntensity: 0.3,
  },
  'plastic-dark': {
    color: new Color('#505868'),
    metalness: 0.0,
    roughness: 0.6,
    envMapIntensity: 0.3,
  },
  rubber: {
    color: new Color('#303540'),
    metalness: 0.0,
    roughness: 0.85,
    envMapIntensity: 0.1,
  },
};

// Selection replaces the body's base color almost entirely — the lerp factor
// is effectively 1.0 (solid overlay) matching professional CAD-tool conventions
// (e.g. SolidWorks / CATIA solid-blue selection).
const SELECTION_TINT_FACTOR = 1.0;

export interface MaterialFactory {
  getDefaultMaterial: () => MeshStandardMaterial;
  getMaterial: (preset: MaterialPreset) => MeshStandardMaterial;
  applySelectionTint: (mesh: Mesh, tintColor: Color) => void;
  removeSelectionTint: (mesh: Mesh) => void;
  dispose: () => void;
}

/**
 * MeshStandardMaterial factory with CAD-quality presets and selection tinting.
 */
export function createMaterialFactory(): MaterialFactory {
  const cache = new Map<MaterialPreset, MeshStandardMaterial>();

  function getMaterial(preset: MaterialPreset): MeshStandardMaterial {
    const existing = cache.get(preset);
    if (existing) return existing;

    const def = PRESETS[preset];
    const mat = new MeshStandardMaterial({
      color: def.color.clone(),
      metalness: def.metalness,
      roughness: def.roughness,
      envMapIntensity: def.envMapIntensity ?? 0.5,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    mat.name = `std_${preset}`;

    cache.set(preset, mat);
    return mat;
  }

  function getDefaultMaterial(): MeshStandardMaterial {
    return getMaterial('cad-default');
  }

  function applySelectionTint(mesh: Mesh, tintColor: Color): void {
    const mat = mesh.material;
    if (!mat || !(mat instanceof MeshStandardMaterial)) return;

    // Store original color so we can restore it later (no material clone)
    if (!mesh.userData._originalColor) {
      mesh.userData._originalColor = mat.color.clone();
    }

    const original = mesh.userData._originalColor as Color;
    mat.color.copy(original).lerp(tintColor ?? ACCENT, SELECTION_TINT_FACTOR);
    // Subtle emissive makes the selection pop in shadowed geometry regions,
    // matching the "lit from within" quality of CAD tool selection highlights.
    mat.emissive.copy(tintColor ?? ACCENT);
    mat.emissiveIntensity = 0.1;
  }

  function removeSelectionTint(mesh: Mesh): void {
    const originalColor = mesh.userData._originalColor as Color | undefined;
    if (!originalColor) return;

    const mat = mesh.material;
    if (mat instanceof MeshStandardMaterial) {
      mat.color.copy(originalColor);
      mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
    }
    delete mesh.userData._originalColor;
  }

  return {
    getDefaultMaterial,
    getMaterial,
    applySelectionTint,
    removeSelectionTint,
    dispose() {
      for (const mat of cache.values()) {
        mat.dispose();
      }
      cache.clear();
    },
  };
}
