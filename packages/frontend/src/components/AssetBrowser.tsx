import { Button, Input } from '@motionlab/ui';
import { Box, Circle, Cylinder, Package, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { getSceneGraph, sendCreatePrimitiveBody, sendPlaceAssetInScene } from '../engine/connection.js';
import type { AssetEntry } from '../stores/asset-library.js';
import { useAssetLibraryStore } from '../stores/asset-library.js';

type PrimitiveShapeKey = 'box' | 'cylinder' | 'sphere';

interface PrimitiveDef {
  label: string;
  shape: PrimitiveShapeKey;
  icon: typeof Box;
  params: {
    box?: { width: number; height: number; depth: number };
    cylinder?: { radius: number; height: number };
    sphere?: { radius: number };
  };
}

const PRIMITIVES: PrimitiveDef[] = [
  { label: 'Box', shape: 'box', icon: Box, params: { box: { width: 1, height: 1, depth: 1 } } },
  { label: 'Cylinder', shape: 'cylinder', icon: Cylinder, params: { cylinder: { radius: 0.5, height: 1 } } },
  { label: 'Sphere', shape: 'sphere', icon: Circle, params: { sphere: { radius: 0.5 } } },
];

function AssetCard({
  asset,
  selected,
  onSelect,
  onPlace,
}: {
  asset: AssetEntry;
  selected: boolean;
  onSelect: () => void;
  onPlace: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex flex-col gap-1.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
        selected
          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-default)] bg-[var(--layer-overlay)] hover:bg-[var(--layer-hover)]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <Package className="size-3.5 shrink-0 text-text-tertiary" />
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-medium text-text-primary">
          {asset.filename}
        </span>
      </div>
      <span className="text-[length:var(--text-2xs)] text-text-tertiary">
        {asset.partCount} part{asset.partCount !== 1 ? 's' : ''}
      </span>
      <Button
        variant="outline"
        size="xs"
        className="mt-1 self-start"
        onClick={(e) => {
          e.stopPropagation();
          onPlace();
        }}
      >
        <Plus className="size-3" />
        Place
      </Button>
    </button>
  );
}

function PrimitiveCard({
  primitive,
  onCreate,
}: {
  primitive: PrimitiveDef;
  onCreate: () => void;
}) {
  const { label, icon: Icon } = primitive;
  return (
    <button
      type="button"
      className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--layer-overlay)] p-3 text-left transition-colors hover:bg-[var(--layer-hover)]"
      onClick={onCreate}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-text-tertiary" />
        <span className="text-[length:var(--text-sm)] font-medium text-text-primary">{label}</span>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="mt-1 self-start"
        onClick={(e) => {
          e.stopPropagation();
          onCreate();
        }}
      >
        <Plus className="size-3" />
        Create
      </Button>
    </button>
  );
}

function Sidebar({
  importCount,
  activeSection,
  onSectionChange,
}: {
  importCount: number;
  activeSection: 'imports' | 'primitives';
  onSectionChange: (section: 'imports' | 'primitives') => void;
}) {
  return (
    <div className="flex w-[200px] shrink-0 flex-col border-e border-[var(--border-default)] py-1">
      <button
        type="button"
        className={`flex items-center gap-2 ps-3 pe-3 py-1.5 text-left text-[length:var(--text-xs)] transition-colors ${
          activeSection === 'imports'
            ? 'bg-[var(--accent-soft)] font-medium text-text-primary'
            : 'text-text-secondary hover:bg-[var(--layer-hover)]'
        }`}
        onClick={() => onSectionChange('imports')}
      >
        <Package className="size-3.5 shrink-0" />
        Imports
        {importCount > 0 && (
          <span className="ms-auto text-[length:var(--text-2xs)] text-text-tertiary">
            {importCount}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`flex items-center gap-2 ps-3 pe-3 py-1.5 text-left text-[length:var(--text-xs)] transition-colors ${
          activeSection === 'primitives'
            ? 'bg-[var(--accent-soft)] font-medium text-text-primary'
            : 'text-text-secondary hover:bg-[var(--layer-hover)]'
        }`}
        onClick={() => onSectionChange('primitives')}
      >
        <Box className="size-3.5 shrink-0" />
        Primitives
      </button>
    </div>
  );
}

export function AssetBrowser() {
  const assets = useAssetLibraryStore((s) => s.assets);
  const selectedAssetId = useAssetLibraryStore((s) => s.selectedAssetId);
  const searchQuery = useAssetLibraryStore((s) => s.searchQuery);
  const selectAsset = useAssetLibraryStore((s) => s.selectAsset);
  const setSearchQuery = useAssetLibraryStore((s) => s.setSearchQuery);

  const [activeSection, setActiveSection] = useState<'imports' | 'primitives'>('imports');

  const assetList = useMemo(() => Array.from(assets.values()), [assets]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery) return assetList;
    const q = searchQuery.toLowerCase();
    return assetList.filter((a) => a.filename.toLowerCase().includes(q));
  }, [assetList, searchQuery]);

  const handlePlace = (asset: AssetEntry) => {
    const sg = getSceneGraph();
    const focusPoint = sg ? sg.getViewportFocusPoint() : { x: 0, y: 0, z: 0 };
    sendPlaceAssetInScene(asset.assetId, focusPoint);
  };

  const handleCreatePrimitive = (primitive: PrimitiveDef) => {
    const sg = getSceneGraph();
    const focusPoint = sg ? sg.getViewportFocusPoint() : { x: 0, y: 0, z: 0 };
    sendCreatePrimitiveBody(primitive.shape, primitive.label, focusPoint, primitive.params);
  };

  return (
    <div className="flex h-full">
      <Sidebar
        importCount={assetList.length}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] ps-3 pe-3 py-1.5">
          <Search className="size-3.5 shrink-0 text-text-tertiary" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-6 border-none bg-transparent ps-0 pe-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {/* Content area */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {activeSection === 'imports' && (
            <>
              {filteredAssets.length === 0 && assetList.length === 0 && (
                <div className="flex h-full items-center justify-center text-[length:var(--text-sm)] text-text-tertiary">
                  Import a CAD file to see it here
                </div>
              )}
              {filteredAssets.length === 0 && assetList.length > 0 && (
                <div className="flex h-full items-center justify-center text-[length:var(--text-sm)] text-text-tertiary">
                  No assets match &ldquo;{searchQuery}&rdquo;
                </div>
              )}
              {filteredAssets.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedAssetId === asset.id}
                      onSelect={() => selectAsset(asset.id)}
                      onPlace={() => handlePlace(asset)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeSection === 'primitives' && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
              {PRIMITIVES.map((p) => (
                <PrimitiveCard
                  key={p.label}
                  primitive={p}
                  onCreate={() => handleCreatePrimitive(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
