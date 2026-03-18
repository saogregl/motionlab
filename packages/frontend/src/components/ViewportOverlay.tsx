import { ViewCube, ViewportHUD } from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { useCallback, useEffect, useState } from 'react';

import { sendDeleteDatum, sendDeleteJoint } from '../engine/connection.js';
import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { JointConfigDialog } from './JointConfigDialog.js';
import { ViewportCameraToolbar } from './ViewportCameraToolbar.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';
import { ViewportToolModeToolbar } from './ViewportToolModeToolbar.js';

function JointCreationStatus() {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );

  if (step === 'pick-parent') {
    return (
      <div className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        Click a datum to set as parent
      </div>
    );
  }
  if (step === 'pick-child') {
    return (
      <div className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        Parent: {parentDatum?.name ?? '?'}. Click a datum on another body
      </div>
    );
  }
  return null;
}

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover, sceneGraphRef } = useViewportBridge();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);
  const activeMode = useToolModeStore((s) => s.activeMode);

  const onReady = useCallback(
    (sg: SceneGraphManager) => {
      setSceneGraph(sg);
      handleSceneReady(sg);
    },
    [handleSceneReady],
  );

  // Visual feedback: highlight parent datum during pick-child step
  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const unsub = useJointCreationStore.subscribe((state, prev) => {
      if (state.step === 'pick-child' && state.parentDatumId) {
        // Show parent datum as selected
        const currentSelected = useSelectionStore.getState().selectedIds;
        const combined = new Set(currentSelected);
        combined.add(state.parentDatumId);
        sg.applySelection(combined);
      } else if (prev.step === 'pick-child' && state.step !== 'pick-child') {
        // Restore normal selection
        sg.applySelection(useSelectionStore.getState().selectedIds);
      }
    });

    return unsub;
  }, [sceneGraphRef]);

  // Keyboard shortcuts for tool modes
  useEffect(() => {
    const setMode = useToolModeStore.getState().setMode;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      switch (e.key) {
        case 'Escape': {
          const mode = useToolModeStore.getState().activeMode;
          if (mode === 'create-joint') {
            const { step } = useJointCreationStore.getState();
            if (step !== 'idle' && step !== 'pick-parent') {
              // Cancel back to pick-parent but stay in create-joint mode
              useJointCreationStore.getState().cancel();
              return;
            }
          }
          // Fall through: go to select mode
          setMode('select');
          useJointCreationStore.getState().reset();
          break;
        }
        case 'v':
        case 'V':
          setMode('select');
          useJointCreationStore.getState().reset();
          break;
        case 'd':
        case 'D':
          setMode('create-datum');
          break;
        case 'j':
        case 'J':
          setMode('create-joint');
          useJointCreationStore.getState().startCreation();
          break;
        case 'Delete': {
          const { selectedIds } = useSelectionStore.getState();
          const { datums, joints } = useMechanismStore.getState();
          for (const id of selectedIds) {
            if (joints.has(id)) {
              sendDeleteJoint(id);
            } else if (datums.has(id)) {
              sendDeleteDatum(id);
            }
          }
          if (selectedIds.size > 0) {
            useSelectionStore.getState().clearSelection();
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const cursorMode = activeMode === 'create-datum' || activeMode === 'create-joint';

  return (
    <ViewportContextMenu sceneGraph={sceneGraph}>
      <div
        className="relative w-full h-full"
        style={{ cursor: cursorMode ? 'crosshair' : undefined }}
      >
        <Viewport onSceneReady={onReady} onPick={handlePick} onHover={handleHover} />
        <ViewportHUD
          topLeft={
            <div className="flex flex-col gap-2">
              <ViewportToolModeToolbar />
              <ViewportCameraToolbar sceneGraph={sceneGraph} />
            </div>
          }
          topRight={
            <ViewCube
              onHome={() => sceneGraph?.setCameraPreset('isometric')}
              onZoomFit={() => sceneGraph?.fitAll()}
            />
          }
          bottomLeft={activeMode === 'create-joint' ? <JointCreationStatus /> : undefined}
        />
        <JointConfigDialog />
      </div>
    </ViewportContextMenu>
  );
}
