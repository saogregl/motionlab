import { type AbstractMesh, Color3, PBRMaterial, type Scene } from '@babylonjs/core';

export type MaterialPreset =
  | 'cad-default'
  | 'steel'
  | 'aluminum'
  | 'plastic-gray'
  | 'plastic-white'
  | 'rubber';

interface PresetDefinition {
  baseColor: Color3;
  metallic: number;
  roughness: number;
}

const PRESETS: Record<MaterialPreset, PresetDefinition> = {
  'cad-default': {
    baseColor: new Color3(0.53, 0.6, 0.67),
    metallic: 0.2,
    roughness: 0.4,
  },
  steel: {
    baseColor: new Color3(0.72, 0.74, 0.78),
    metallic: 0.9,
    roughness: 0.3,
  },
  aluminum: {
    baseColor: new Color3(0.84, 0.86, 0.9),
    metallic: 0.85,
    roughness: 0.35,
  },
  'plastic-gray': {
    baseColor: new Color3(0.6, 0.62, 0.64),
    metallic: 0.0,
    roughness: 0.5,
  },
  'plastic-white': {
    baseColor: new Color3(0.9, 0.9, 0.9),
    metallic: 0.0,
    roughness: 0.4,
  },
  rubber: {
    baseColor: new Color3(0.15, 0.15, 0.15),
    metallic: 0.0,
    roughness: 0.9,
  },
};

const ACCENT_COLOR = new Color3(0.06, 0.38, 0.996); // --accent-primary: #0f62fe
const SELECTION_TINT_FACTOR = 0.15;

export interface MaterialFactory {
  getMaterial: (preset: MaterialPreset) => PBRMaterial;
  getDefaultMaterial: () => PBRMaterial;
  applySelectionTint: (mesh: AbstractMesh) => void;
  removeSelectionTint: (mesh: AbstractMesh) => void;
  dispose: () => void;
}

/**
 * PBR material factory with CAD-quality presets and selection tinting.
 */
export function createMaterialFactory(scene: Scene): MaterialFactory {
  const cache = new Map<MaterialPreset, PBRMaterial>();
  const originalColors = new WeakMap<AbstractMesh, Color3>();

  function getMaterial(preset: MaterialPreset): PBRMaterial {
    const existing = cache.get(preset);
    if (existing) return existing;

    const def = PRESETS[preset];
    const mat = new PBRMaterial(`pbr_${preset}`, scene);
    mat.albedoColor = def.baseColor.clone();
    mat.metallic = def.metallic;
    mat.roughness = def.roughness;
    mat.backFaceCulling = true;
    mat.useRadianceOverAlpha = true;

    cache.set(preset, mat);
    return mat;
  }

  function getDefaultMaterial(): PBRMaterial {
    return getMaterial('cad-default');
  }

  function applySelectionTint(mesh: AbstractMesh): void {
    const mat = mesh.material;
    if (!mat || !(mat instanceof PBRMaterial) || !mat.albedoColor) return;

    if (!originalColors.has(mesh)) {
      originalColors.set(mesh, mat.albedoColor.clone());
    }

    const original = originalColors.get(mesh);
    if (!original) return;
    // We need a per-mesh material clone to avoid tinting all meshes sharing the material
    const tinted = mat.clone(`${mat.name}_selected`) as PBRMaterial;
    tinted.albedoColor = Color3.Lerp(original, ACCENT_COLOR, SELECTION_TINT_FACTOR);
    mesh.material = tinted;
  }

  function removeSelectionTint(mesh: AbstractMesh): void {
    const original = originalColors.get(mesh);
    if (!original) return;

    // Dispose the cloned tinted material (only PBR materials were tinted)
    const currentMat = mesh.material;
    if (!currentMat || !(currentMat instanceof PBRMaterial)) {
      originalColors.delete(mesh);
      return;
    }
    if (currentMat?.name.endsWith('_selected')) {
      // Find the base preset material to restore
      const baseName = currentMat.name.replace('_selected', '');
      const baseMat = cache.get(baseName.replace('pbr_', '') as MaterialPreset);
      if (baseMat) {
        mesh.material = baseMat;
      }
      currentMat.dispose();
    }

    originalColors.delete(mesh);
  }

  return {
    getMaterial,
    getDefaultMaterial,
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
