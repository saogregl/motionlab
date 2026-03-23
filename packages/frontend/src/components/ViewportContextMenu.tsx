import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import {
  ArrowLeftRight,
  Camera,
  Crosshair,
  Eye,
  EyeOff,
  FlipVertical,
  Focus,
  Grid3x3,
  Hexagon,
  Link2,
  MousePointerClick,
  RefreshCw,
  ScanSearch,
  Settings2,
  Trash2,
  Unlink,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { sendDeleteDatum, sendDeleteJoint, sendDeleteLoad, sendDetachGeometry } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useVisibilityStore } from '../stores/visibility.js';
import { resolveViewportEntityId } from '../utils/viewport-entity-resolution.js';

const itemCls = 'h-7 px-3';
const iconCls = 'size-3.5 shrink-0 text-text-tertiary';

const jointTypes = ['Revolute', 'Prismatic', 'Cylindrical', 'Spherical', 'Planar', 'Fixed'] as const;

interface ViewportContextMenuProps {
  sceneGraph: SceneGraphManager | null;
  children: ReactNode;
}

type EntityTarget = {
  id: string;
  type: 'body' | 'geometry' | 'datum' | 'joint' | 'load';
} | null;

function resolveEntityTarget(hoveredId: string | null): EntityTarget {
  if (!hoveredId) return null;
  const { bodies, geometries, datums, joints, loads } = useMechanismStore.getState();
  if (bodies.has(hoveredId)) return { id: hoveredId, type: 'body' };
  if (geometries.has(hoveredId)) return { id: hoveredId, type: 'geometry' };
  if (datums.has(hoveredId)) return { id: hoveredId, type: 'datum' };
  if (joints.has(hoveredId)) return { id: hoveredId, type: 'joint' };
  if (loads.has(hoveredId)) return { id: hoveredId, type: 'load' };
  return null;
}

function BodyMenuContent({
  entityId,
  sceneGraph,
}: {
  entityId: string;
  sceneGraph: SceneGraphManager | null;
}) {
  const isHidden = useVisibilityStore((s) => s.hiddenIds.has(entityId));
  const allBodyIds = useMechanismStore((s) => [...s.bodies.keys()]);

  return (
    <>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().setSelection([entityId])}
      >
        <MousePointerClick className={iconCls} /> Select
      </ContextMenuItem>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useVisibilityStore.getState().isolate(entityId, allBodyIds)}
      >
        <ScanSearch className={iconCls} /> Isolate
        <ContextMenuShortcut>I</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useVisibilityStore.getState().toggleVisibility(entityId)}
      >
        {isHidden ? <Eye className={iconCls} /> : <EyeOff className={iconCls} />}
        {isHidden ? 'Show' : 'Hide'}
        <ContextMenuShortcut>H</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useToolModeStore.getState().setMode('create-datum')}
      >
        <Crosshair className={iconCls} /> Create Datum
      </ContextMenuItem>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useToolModeStore.getState().setMode('create-joint')}
      >
        <Link2 className={iconCls} /> Create Joint
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={() => sceneGraph?.focusOnEntity(entityId)}>
        <Focus className={iconCls} /> Focus
        <ContextMenuShortcut>F</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function DatumMenuContent({
  entityId,
  sceneGraph,
}: {
  entityId: string;
  sceneGraph: SceneGraphManager | null;
}) {
  return (
    <>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().setSelection([entityId])}
      >
        <MousePointerClick className={iconCls} /> Select
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={() => sceneGraph?.focusOnEntity(entityId)}>
        <Focus className={iconCls} /> Focus
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useToolModeStore.getState().setMode('create-joint')}
      >
        <Link2 className={iconCls} /> Create Joint
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        variant="destructive"
        onSelect={() => sendDeleteDatum(entityId)}
      >
        <Trash2 className={iconCls} /> Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function JointMenuContent({
  entityId,
  sceneGraph,
}: {
  entityId: string;
  sceneGraph: SceneGraphManager | null;
}) {
  return (
    <>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().setSelection([entityId])}
      >
        <MousePointerClick className={iconCls} /> Select
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={() => sceneGraph?.focusOnEntity(entityId)}>
        <Focus className={iconCls} /> Focus
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={() => {}}>
        <Wrench className={iconCls} /> Edit Joint
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger className={itemCls}>
          <RefreshCw className={iconCls} /> Change Type
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {jointTypes.map((type) => (
            <ContextMenuItem key={type} className={itemCls} onSelect={() => {}}>
              {type}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={() => {}}>
        <ArrowLeftRight className={iconCls} /> Swap Bodies
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={() => {}}>
        <FlipVertical className={iconCls} /> Reverse Direction
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        variant="destructive"
        onSelect={() => sendDeleteJoint(entityId)}
      >
        <Trash2 className={iconCls} /> Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function GeometryMenuContent({
  entityId,
  sceneGraph,
}: {
  entityId: string;
  sceneGraph: SceneGraphManager | null;
}) {
  const geom = useMechanismStore((s) => s.geometries.get(entityId));
  const bodies = useMechanismStore((s) => s.bodies);
  const geometries = useMechanismStore((s) => s.geometries);
  const focusTargetId = resolveViewportEntityId(entityId, bodies, geometries);
  return (
    <>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().setSelection([entityId])}
      >
        <MousePointerClick className={iconCls} /> Select
      </ContextMenuItem>
      <ContextMenuItem
        className={itemCls}
        onSelect={focusTargetId ? () => sceneGraph?.focusOnEntity(focusTargetId) : undefined}
        disabled={!focusTargetId}
        title={!focusTargetId ? 'Geometry is not attached to a body' : undefined}
      >
        <Focus className={iconCls} /> Focus
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        disabled={!geom?.parentBodyId}
        onSelect={() => sendDetachGeometry(entityId)}
      >
        <Unlink className={iconCls} /> Detach from Body
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().select(entityId)}
      >
        <Settings2 className={iconCls} /> Properties
      </ContextMenuItem>
    </>
  );
}

function LoadMenuContent({ entityId }: { entityId: string }) {
  return (
    <>
      <ContextMenuItem
        className={itemCls}
        onSelect={() => useSelectionStore.getState().select(entityId)}
      >
        <MousePointerClick className={iconCls} />
        Select
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        onSelect={() => sendDeleteLoad(entityId)}
      >
        <Trash2 className={`${iconCls} text-destructive`} />
        Delete
      </ContextMenuItem>
    </>
  );
}

function BackgroundMenuContent({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger className={itemCls}>
          <Camera className={iconCls} /> Camera
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('isometric')}
          >
            Isometric <ContextMenuShortcut>0</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('front')}
          >
            Front <ContextMenuShortcut>1</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('back')}
          >
            Back <ContextMenuShortcut>3</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('left')}
          >
            Left <ContextMenuShortcut>4</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('right')}
          >
            Right <ContextMenuShortcut>6</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('top')}
          >
            Top <ContextMenuShortcut>7</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            className={itemCls}
            onClick={() => sceneGraph?.setCameraPreset('bottom')}
          >
            Bottom <ContextMenuShortcut>9</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onClick={() => sceneGraph?.fitAll()}>
        <Focus className={iconCls} /> Fit All
        <ContextMenuShortcut>F</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onClick={() => sceneGraph?.toggleGrid()}>
        <Grid3x3 className={iconCls} /> {sceneGraph?.gridVisible ? 'Hide Grid' : 'Show Grid'}
        <ContextMenuShortcut>G</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={itemCls}
        onClick={() => useVisibilityStore.getState().showAll()}
      >
        <Eye className={iconCls} /> Show All Hidden
      </ContextMenuItem>
    </>
  );
}

export function ViewportContextMenu({ sceneGraph, children }: ViewportContextMenuProps) {
  const [target, setTarget] = useState<EntityTarget>(null);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          const hoveredId = useSelectionStore.getState().hoveredId;
          setTarget(resolveEntityTarget(hoveredId));
        }
      }}
    >
      <ContextMenuTrigger className="w-full h-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        {target?.type === 'body' && (
          <BodyMenuContent entityId={target.id} sceneGraph={sceneGraph} />
        )}
        {target?.type === 'geometry' && (
          <GeometryMenuContent entityId={target.id} sceneGraph={sceneGraph} />
        )}
        {target?.type === 'datum' && (
          <DatumMenuContent entityId={target.id} sceneGraph={sceneGraph} />
        )}
        {target?.type === 'joint' && (
          <JointMenuContent entityId={target.id} sceneGraph={sceneGraph} />
        )}
        {target?.type === 'load' && (
          <LoadMenuContent entityId={target.id} />
        )}
        {!target && <BackgroundMenuContent sceneGraph={sceneGraph} />}
      </ContextMenuContent>
    </ContextMenu>
  );
}
