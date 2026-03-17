import { ViewCube, ViewportHUD } from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { useCallback, useState } from 'react';

import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { ViewportCameraToolbar } from './ViewportCameraToolbar.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover } = useViewportBridge();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);

  const onReady = useCallback(
    (sg: SceneGraphManager) => {
      setSceneGraph(sg);
      handleSceneReady(sg);
    },
    [handleSceneReady],
  );

  return (
    <ViewportContextMenu sceneGraph={sceneGraph}>
      <div className="relative w-full h-full">
        <Viewport onSceneReady={onReady} onPick={handlePick} onHover={handleHover} />
        <ViewportHUD
          topLeft={<ViewportCameraToolbar sceneGraph={sceneGraph} />}
          topRight={
            <ViewCube
              onHome={() => sceneGraph?.setCameraPreset('isometric')}
              onZoomFit={() => sceneGraph?.fitAll()}
            />
          }
        />
      </div>
    </ViewportContextMenu>
  );
}
