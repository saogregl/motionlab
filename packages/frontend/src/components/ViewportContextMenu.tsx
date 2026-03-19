import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import type { ReactNode } from 'react';

interface ViewportContextMenuProps {
  sceneGraph: SceneGraphManager | null;
  children: ReactNode;
}

export function ViewportContextMenu({ sceneGraph, children }: ViewportContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full">{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => sceneGraph?.fitAll()}>Fit All</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Camera</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('isometric')}>
              Isometric
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('front')}>
              Front
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('back')}>
              Back
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('left')}>
              Left
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('right')}>
              Right
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('top')}>
              Top
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sceneGraph?.setCameraPreset('bottom')}>
              Bottom
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => sceneGraph?.toggleGrid()}>
          {sceneGraph?.gridVisible ? 'Hide Grid' : 'Show Grid'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
