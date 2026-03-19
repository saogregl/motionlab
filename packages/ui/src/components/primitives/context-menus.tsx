import type { ReactNode } from 'react';

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

/* ── BodyContextMenu ── */

interface BodyContextMenuProps {
  children: ReactNode;
  isHidden?: boolean;
  onSelectInViewport?: () => void;
  onIsolate?: () => void;
  onToggleVisibility?: () => void;
  onCreateDatum?: () => void;
  onCreateJoint?: () => void;
  onRename?: () => void;
  onProperties?: () => void;
  onDelete?: () => void;
}

function BodyContextMenu({
  children,
  isHidden,
  onSelectInViewport,
  onIsolate,
  onToggleVisibility,
  onCreateDatum,
  onCreateJoint,
  onRename,
  onProperties,
  onDelete,
}: BodyContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
          Select in Viewport
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onIsolate}>
          Isolate
          <ContextMenuShortcut>I</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onToggleVisibility}>
          {isHidden ? 'Show' : 'Hide'}
          <ContextMenuShortcut>H</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onCreateDatum}>
          Create Datum on Body
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onCreateJoint}>
          Create Joint from Body
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onRename}>
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onProperties}>
          Properties
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete}>
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── JointContextMenu ── */

const jointTypes = ['Revolute', 'Slider', 'Cylindrical', 'Ball', 'Fixed', 'Planar'] as const;

interface JointContextMenuProps {
  children: ReactNode;
  onSelectInViewport?: () => void;
  onFocusViewport?: () => void;
  onEditJoint?: () => void;
  onChangeType?: (type: string) => void;
  onSwapBodies?: () => void;
  onReverseDirection?: () => void;
  onRename?: () => void;
  onProperties?: () => void;
  onDelete?: () => void;
}

function JointContextMenu({
  children,
  onSelectInViewport,
  onFocusViewport,
  onEditJoint,
  onChangeType,
  onSwapBodies,
  onReverseDirection,
  onRename,
  onProperties,
  onDelete,
}: JointContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
          Select in Viewport
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onFocusViewport}>
          Focus Viewport on Joint
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onEditJoint}>
          Edit Joint
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={itemCls}>Change Type</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {jointTypes.map((type) => (
              <ContextMenuItem key={type} className={itemCls} onSelect={() => onChangeType?.(type)}>
                {type}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onSwapBodies}>
          Swap Bodies
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onReverseDirection}>
          Reverse Direction
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onRename}>
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onProperties}>
          Properties
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete}>
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
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
  onRename?: () => void;
  onProperties?: () => void;
  onDelete?: () => void;
}

function DatumContextMenu({
  children,
  onSelectInViewport,
  onFocusViewport,
  onCreateJoint,
  onRename,
  onProperties,
  onDelete,
}: DatumContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[220px]">
        <ContextMenuItem className={itemCls} onSelect={onSelectInViewport}>
          Select in Viewport
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onFocusViewport}>
          Focus Viewport on Datum
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onCreateJoint}>
          Create Joint from Datum
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={itemCls} onSelect={onRename}>
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} onSelect={onProperties}>
          Properties
        </ContextMenuItem>
        <ContextMenuItem className={itemCls} variant="destructive" onSelect={onDelete}>
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export { BodyContextMenu, JointContextMenu, DatumContextMenu };
export type { BodyContextMenuProps, JointContextMenuProps, DatumContextMenuProps };
