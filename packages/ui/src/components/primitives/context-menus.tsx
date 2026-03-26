import type { ReactNode } from 'react';

import {
  ArrowLeftRight,
  Box,
  Crosshair,
  Eye,
  EyeOff,
  FlipVertical,
  Focus,
  Link2,
  MousePointerClick,
  Pencil,
  RefreshCw,
  ScanSearch,
  Settings2,
  Trash2,
  Unlink,
  Wrench,
  Zap,
} from 'lucide-react';

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
} from '../ui/context-menu';

/* ── Shared item class for consistent 28px height + 12px padding ── */

const itemCls = 'h-7 px-3';
const iconCls = 'size-3.5 shrink-0 text-text-tertiary';

/* ── BodyContextMenu ── */

interface BodyContextMenuProps {
  children: ReactNode;
  isHidden?: boolean;
  onSelectInViewport?: () => void;
  onIsolate?: () => void;
  isolateDisabledReason?: string;
  onToggleVisibility?: () => void;
  visibilityDisabledReason?: string;
  onCreateDatum?: () => void;
  createDatumDisabledReason?: string;
  onCreateJoint?: () => void;
  createJointDisabledReason?: string;
  onRename?: () => void;
  renameDisabledReason?: string;
  onProperties?: () => void;
  onDelete?: () => void;
  deleteDisabledReason?: string;
}

function BodyContextMenuItems({
  isHidden,
  onSelectInViewport,
  onIsolate,
  isolateDisabledReason,
  onToggleVisibility,
  visibilityDisabledReason,
  onCreateDatum,
  createDatumDisabledReason,
  onCreateJoint,
  createJointDisabledReason,
  onRename,
  renameDisabledReason,
  onProperties,
  onDelete,
  deleteDisabledReason,
}: Omit<BodyContextMenuProps, 'children'>) {
  return (
    <>
      <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
        <MousePointerClick className={iconCls} />
        Select in Viewport
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onIsolate} disabled={!onIsolate} title={!onIsolate ? isolateDisabledReason : undefined}>
        <ScanSearch className={iconCls} />
        Isolate
        <ContextMenuShortcut>I</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onToggleVisibility} disabled={!onToggleVisibility} title={!onToggleVisibility ? visibilityDisabledReason : undefined}>
        {isHidden ? <Eye className={iconCls} /> : <EyeOff className={iconCls} />}
        {isHidden ? 'Show' : 'Hide'}
        <ContextMenuShortcut>H</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onCreateDatum} disabled={!onCreateDatum} title={!onCreateDatum ? createDatumDisabledReason : undefined}>
        <Crosshair className={iconCls} />
        Create Datum on Body
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onCreateJoint} disabled={!onCreateJoint} title={!onCreateJoint ? createJointDisabledReason : undefined}>
        <Link2 className={iconCls} />
        Create Joint from Body
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onRename} disabled={!onRename} title={!onRename ? renameDisabledReason : undefined}>
        <Pencil className={iconCls} />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onProperties}>
        <Settings2 className={iconCls} />
        Properties
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete} disabled={!onDelete} title={!onDelete ? deleteDisabledReason : undefined}>
        <Trash2 className={iconCls} />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function BodyContextMenu({ children, ...rest }: BodyContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <BodyContextMenuItems {...rest} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── JointContextMenu ── */

const jointTypes = ['Revolute', 'Prismatic', 'Cylindrical', 'Spherical', 'Planar', 'Fixed'] as const;

interface JointContextMenuProps {
  children: ReactNode;
  onSelectInViewport?: () => void;
  onFocusViewport?: () => void;
  onEditJoint?: () => void;
  onChangeType?: (type: string) => void;
  changeTypeDisabledReason?: string;
  onAddMotor?: () => void;
  addMotorDisabledReason?: string;
  onSwapBodies?: () => void;
  swapBodiesDisabledReason?: string;
  onReverseDirection?: () => void;
  reverseDirectionDisabledReason?: string;
  onRename?: () => void;
  renameDisabledReason?: string;
  onProperties?: () => void;
  onDelete?: () => void;
  deleteDisabledReason?: string;
}

function JointContextMenuItems({
  onSelectInViewport,
  onFocusViewport,
  onEditJoint,
  onChangeType,
  changeTypeDisabledReason,
  onAddMotor,
  addMotorDisabledReason,
  onSwapBodies,
  swapBodiesDisabledReason,
  onReverseDirection,
  reverseDirectionDisabledReason,
  onRename,
  renameDisabledReason,
  onProperties,
  onDelete,
  deleteDisabledReason,
}: Omit<JointContextMenuProps, 'children'>) {
  return (
    <>
      <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
        <MousePointerClick className={iconCls} />
        Select in Viewport
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onFocusViewport}>
        <Focus className={iconCls} />
        Focus Viewport on Joint
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onEditJoint}>
        <Wrench className={iconCls} />
        Edit Joint
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger className={itemCls} disabled={!onChangeType} title={!onChangeType ? changeTypeDisabledReason : undefined}>
          <RefreshCw className={iconCls} />
          Change Type
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {jointTypes.map((type) => (
            <ContextMenuItem key={type} className={itemCls} onSelect={() => onChangeType?.(type)}>
              {type}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem className={itemCls} onSelect={onAddMotor} disabled={!onAddMotor} title={!onAddMotor ? addMotorDisabledReason : undefined}>
        <Zap className={iconCls} />
        Add Motor
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onSwapBodies} disabled={!onSwapBodies} title={!onSwapBodies ? swapBodiesDisabledReason : undefined}>
        <ArrowLeftRight className={iconCls} />
        Swap Bodies
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onReverseDirection} disabled={!onReverseDirection} title={!onReverseDirection ? reverseDirectionDisabledReason : undefined}>
        <FlipVertical className={iconCls} />
        Reverse Direction
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onRename} disabled={!onRename} title={!onRename ? renameDisabledReason : undefined}>
        <Pencil className={iconCls} />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onProperties}>
        <Settings2 className={iconCls} />
        Properties
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete} disabled={!onDelete} title={!onDelete ? deleteDisabledReason : undefined}>
        <Trash2 className={iconCls} />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function JointContextMenu({ children, ...rest }: JointContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <JointContextMenuItems {...rest} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── DatumContextMenu ── */

interface DatumContextMenuProps {
  children: ReactNode;
  onSelectInViewport?: () => void;
  onFocusViewport?: () => void;
  onCreateJoint?: () => void;
  createJointDisabledReason?: string;
  onCreateLoad?: () => void;
  createLoadDisabledReason?: string;
  onRename?: () => void;
  renameDisabledReason?: string;
  onProperties?: () => void;
  onDelete?: () => void;
  deleteDisabledReason?: string;
}

function DatumContextMenuItems({
  onSelectInViewport,
  onFocusViewport,
  onCreateJoint,
  createJointDisabledReason,
  onCreateLoad,
  createLoadDisabledReason,
  onRename,
  renameDisabledReason,
  onProperties,
  onDelete,
  deleteDisabledReason,
}: Omit<DatumContextMenuProps, 'children'>) {
  return (
    <>
      <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
        <MousePointerClick className={iconCls} />
        Select in Viewport
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onFocusViewport}>
        <Focus className={iconCls} />
        Focus Viewport on Datum
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onCreateJoint} disabled={!onCreateJoint} title={!onCreateJoint ? createJointDisabledReason : undefined}>
        <Link2 className={iconCls} />
        Create Joint from Datum
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onCreateLoad} disabled={!onCreateLoad} title={!onCreateLoad ? createLoadDisabledReason : undefined}>
        <Zap className={iconCls} />
        Create Load on Datum
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onRename} disabled={!onRename} title={!onRename ? renameDisabledReason : undefined}>
        <Pencil className={iconCls} />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onProperties}>
        <Settings2 className={iconCls} />
        Properties
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete} disabled={!onDelete} title={!onDelete ? deleteDisabledReason : undefined}>
        <Trash2 className={iconCls} />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function DatumContextMenu({ children, ...rest }: DatumContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <DatumContextMenuItems {...rest} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── GeometryContextMenu ── */

interface GeometryContextMenuProps {
  children: ReactNode;
  isParented?: boolean;
  onSelectInViewport?: () => void;
  onFocusViewport?: () => void;
  focusDisabledReason?: string;
  onMakeBody?: () => void;
  makeBodyDisabledReason?: string;
  bodyList?: Array<{ id: string; name: string }>;
  onMoveToBody?: (bodyId: string) => void;
  onAttachToBody?: () => void;
  attachDisabledReason?: string;
  onDetachFromBody?: () => void;
  detachDisabledReason?: string;
  onRename?: () => void;
  renameDisabledReason?: string;
  onProperties?: () => void;
  onDelete?: () => void;
  deleteDisabledReason?: string;
}

function GeometryContextMenuItems({
  isParented,
  onSelectInViewport,
  onFocusViewport,
  focusDisabledReason,
  onMakeBody,
  makeBodyDisabledReason,
  bodyList,
  onMoveToBody,
  onAttachToBody,
  attachDisabledReason,
  onDetachFromBody,
  detachDisabledReason,
  onRename,
  renameDisabledReason,
  onProperties,
  onDelete,
  deleteDisabledReason,
}: Omit<GeometryContextMenuProps, 'children'>) {
  return (
    <>
      <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
        <MousePointerClick className={iconCls} />
        Select in Viewport
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onFocusViewport} disabled={!onFocusViewport} title={!onFocusViewport ? focusDisabledReason : undefined}>
        <Focus className={iconCls} />
        Focus Viewport on Geometry
      </ContextMenuItem>
      <ContextMenuSeparator />
      {!isParented && (
        <ContextMenuItem className={itemCls} onSelect={onMakeBody} disabled={!onMakeBody} title={!onMakeBody ? makeBodyDisabledReason : undefined}>
          <Box className={iconCls} />
          Make Body
        </ContextMenuItem>
      )}
      {bodyList && bodyList.length > 0 && onMoveToBody && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className={itemCls}>
            <Link2 className={iconCls} />
            {isParented ? 'Move to Body' : 'Attach to Body'}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {bodyList.map((body) => (
              <ContextMenuItem key={body.id} className={itemCls} onSelect={() => onMoveToBody(body.id)}>
                {body.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {(!bodyList || bodyList.length === 0) && (
        <ContextMenuItem className={itemCls} onSelect={onAttachToBody} disabled={!onAttachToBody} title={!onAttachToBody ? attachDisabledReason : undefined}>
          <Link2 className={iconCls} />
          Attach to Body…
        </ContextMenuItem>
      )}
      <ContextMenuItem className={itemCls} onSelect={onDetachFromBody} disabled={!onDetachFromBody || !isParented} title={!onDetachFromBody ? detachDisabledReason : !isParented ? 'Geometry is not attached to a body' : undefined}>
        <Unlink className={iconCls} />
        Detach from Body
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onRename} disabled={!onRename} title={!onRename ? renameDisabledReason : undefined}>
        <Pencil className={iconCls} />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className={itemCls} onSelect={onProperties}>
        <Settings2 className={iconCls} />
        Properties
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete} disabled={!onDelete} title={!onDelete ? deleteDisabledReason : undefined}>
        <Trash2 className={iconCls} />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function GeometryContextMenu({ children, ...rest }: GeometryContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <GeometryContextMenuItems {...rest} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── MultiSelectContextMenu ── */

import { GitBranchPlus, Scissors } from 'lucide-react';

interface MultiSelectContextMenuProps {
  children: ReactNode;
  selectionSummary: string;
  onMakeBody?: () => void;
  makeBodyDisabledReason?: string;
  onSplitFromBody?: () => void;
  splitFromBodyDisabledReason?: string;
  onDelete?: () => void;
  deleteDisabledReason?: string;
}

function MultiSelectContextMenuItems({
  selectionSummary,
  onMakeBody,
  makeBodyDisabledReason,
  onSplitFromBody,
  splitFromBodyDisabledReason,
  onDelete,
  deleteDisabledReason,
}: Omit<MultiSelectContextMenuProps, 'children'>) {
  return (
    <>
      <div className="px-3 py-1.5 text-2xs text-text-tertiary">{selectionSummary}</div>
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} onSelect={onMakeBody} disabled={!onMakeBody} title={!onMakeBody ? makeBodyDisabledReason : undefined}>
        <GitBranchPlus className={iconCls} />
        Make Body
        <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
      </ContextMenuItem>
      {onSplitFromBody !== undefined && (
        <ContextMenuItem className={itemCls} onSelect={onSplitFromBody} disabled={!onSplitFromBody} title={!onSplitFromBody ? splitFromBodyDisabledReason : undefined}>
          <Scissors className={iconCls} />
          Split from Body
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete} disabled={!onDelete} title={!onDelete ? deleteDisabledReason : undefined}>
        <Trash2 className={iconCls} />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function MultiSelectContextMenu({ children, ...rest }: MultiSelectContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <MultiSelectContextMenuItems {...rest} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export { BodyContextMenu, BodyContextMenuItems, JointContextMenu, JointContextMenuItems, DatumContextMenu, DatumContextMenuItems, GeometryContextMenu, GeometryContextMenuItems, MultiSelectContextMenu, MultiSelectContextMenuItems };
export type { BodyContextMenuProps, JointContextMenuProps, DatumContextMenuProps, GeometryContextMenuProps, MultiSelectContextMenuProps };
