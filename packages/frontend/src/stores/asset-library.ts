import { create } from 'zustand';

export interface ImportOptions {
  densityOverride?: number;
  tessellationQuality?: number;
  unitSystem?: string;
}

export interface AssetEntry {
  id: string;                    // UUID for the store entry
  assetId: string;               // engine cache_key — used for PlaceAssetInScene
  filename: string;              // original filename
  contentHash: string;           // file content hash
  importedAt: number;            // timestamp
  partCount: number;             // number of geometries
  type: 'cad-import' | 'primitive';
  importFilePath: string;        // fallback for re-import if cache cleared
  importOptions?: ImportOptions;
}

interface AssetLibraryState {
  assets: Map<string, AssetEntry>;
  selectedAssetId: string | null;
  searchQuery: string;
  registerImportedAsset(entry: Omit<AssetEntry, 'id' | 'importedAt'>): void;
  selectAsset(id: string | null): void;
  setSearchQuery(query: string): void;
  removeAsset(id: string): void;
  clear(): void;
}

export const useAssetLibraryStore = create<AssetLibraryState>()((set) => ({
  assets: new Map(),
  selectedAssetId: null,
  searchQuery: '',

  registerImportedAsset: (entry) =>
    set((state) => {
      const id = crypto.randomUUID();
      const next = new Map(state.assets);
      next.set(id, { ...entry, id, importedAt: Date.now() });
      return { assets: next };
    }),

  selectAsset: (id) => set({ selectedAssetId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  removeAsset: (id) =>
    set((state) => {
      const next = new Map(state.assets);
      next.delete(id);
      return {
        assets: next,
        selectedAssetId: state.selectedAssetId === id ? null : state.selectedAssetId,
      };
    }),

  clear: () => set({ assets: new Map(), selectedAssetId: null, searchQuery: '' }),
}));
