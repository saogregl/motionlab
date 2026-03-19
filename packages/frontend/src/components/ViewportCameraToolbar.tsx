import { ToolbarButton } from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Grid3x3,
  Maximize2,
  MonitorDown,
  MonitorUp,
} from 'lucide-react';

interface ViewportCameraToolbarProps {
  sceneGraph: SceneGraphManager | null;
}

export function ViewportCameraToolbar({ sceneGraph }: ViewportCameraToolbarProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-background/80 p-0.5 backdrop-blur-sm">
      <ToolbarButton tooltip="Fit All" onClick={() => sceneGraph?.fitAll()}>
        <Maximize2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Isometric" onClick={() => sceneGraph?.setCameraPreset('isometric')}>
        <Box className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Front" onClick={() => sceneGraph?.setCameraPreset('front')}>
        <MonitorUp className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Back" onClick={() => sceneGraph?.setCameraPreset('back')}>
        <MonitorDown className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Left" onClick={() => sceneGraph?.setCameraPreset('left')}>
        <ArrowLeft className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Right" onClick={() => sceneGraph?.setCameraPreset('right')}>
        <ArrowRight className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Top" onClick={() => sceneGraph?.setCameraPreset('top')}>
        <ArrowUp className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Bottom" onClick={() => sceneGraph?.setCameraPreset('bottom')}>
        <ArrowDown className="size-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Toggle Grid" onClick={() => sceneGraph?.toggleGrid()}>
        <Grid3x3 className="size-4" />
      </ToolbarButton>
    </div>
  );
}
