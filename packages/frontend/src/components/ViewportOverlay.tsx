import { SimulationAction } from '@motionlab/protocol';
import { SelectionChip, ViewportHUD } from '@motionlab/ui';
import type { SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { Box, Crosshair, Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sendDeleteDatum, sendDeleteJoint, sendSimulationControl } from '../engine/connection.js';
import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { JointConfigDialog } from './JointConfigDialog.js';
import { ViewportCameraToolbar } from './ViewportCameraToolbar.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';
import { FaceTooltip } from './FaceTooltip.js';
import { ViewportToolModeToolbar } from './ViewportToolModeToolbar.js';

function SelectionIcon({ entityType }: { entityType: 'body' | 'datum' | 'joint' }) {
  switch (entityType) {
    case 'body':
      return <Box className="size-3.5" />;
    case 'datum':
      return <Crosshair className="size-3.5" />;
    case 'joint':
      return <Link2 className="size-3.5" />;
  }
}

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

function DatumCreationStatus() {
  const message = useAuthoringStatusStore((s) => s.message);

  return (
    <div className="flex flex-col gap-1">
      <div className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        Click a face to create a datum
      </div>
      {message ? (
        <div className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function useSelectedEntity() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);

  return useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = selectedIds.values().next().value as string;
    const body = bodies.get(id);
    if (body) return { id, name: body.name, entityType: 'body' as const };
    const datum = datums.get(id);
    if (datum) return { id, name: datum.name, entityType: 'datum' as const };
    const joint = joints.get(id);
    if (joint) return { id, name: joint.name, entityType: 'joint' as const };
    return null;
  }, [selectedIds, bodies, datums, joints]);
}

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover, sceneGraphRef } = useViewportBridge();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);
  const activeMode = useToolModeStore((s) => s.activeMode);
  const selectedEntity = useSelectedEntity();
  const [hoveredFace, setHoveredFace] = useState<{ bodyId: string; faceIndex: number } | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);

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
    const clearMessage = useAuthoringStatusStore.getState().clearMessage;
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
          clearMessage();
          break;
        }
        case 'v':
        case 'V':
          setMode('select');
          useJointCreationStore.getState().reset();
          clearMessage();
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
        case 'w':
        case 'W':
          useToolModeStore.getState().setGizmoMode('translate');
          break;
        case 'e':
        case 'E':
          useToolModeStore.getState().setGizmoMode('rotate');
          break;
        case 'q':
        case 'Q':
          useToolModeStore.getState().setGizmoMode('off');
          break;
        case 'Delete': {
          const simDel = useSimulationStore.getState().state;
          if (simDel === 'running' || simDel === 'paused') break;
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
        case ' ': {
          e.preventDefault();
          const sim = useSimulationStore.getState().state;
          if (sim === 'running') sendSimulationControl(SimulationAction.PAUSE);
          else if (sim === 'paused') sendSimulationControl(SimulationAction.PLAY);
          break;
        }
        case '.': {
          const sim = useSimulationStore.getState().state;
          if (sim === 'paused') sendSimulationControl(SimulationAction.STEP);
          break;
        }
        case 'r':
        case 'R': {
          const sim = useSimulationStore.getState().state;
          if (sim !== 'idle' && sim !== 'compiling') {
            sendSimulationControl(SimulationAction.RESET);
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeMode !== 'create-datum') {
      useAuthoringStatusStore.getState().clearMessage();
      return;
    }
    useSelectionStore.getState().setHovered(null);
  }, [activeMode]);

  const cursorMode = activeMode === 'create-datum' || activeMode === 'create-joint';

  return (
    <ViewportContextMenu sceneGraph={sceneGraph}>
      <div
        ref={viewportContainerRef}
        className="relative w-full h-full"
        style={{ cursor: cursorMode ? 'crosshair' : undefined }}
      >
        <Viewport
          onSceneReady={onReady}
          onPick={handlePick}
          onHover={handleHover}
          onFaceHover={setHoveredFace}
          interactionMode={activeMode}
        />
        {activeMode === 'create-datum' && (
          <FaceTooltip containerRef={viewportContainerRef} hoveredFace={hoveredFace} />
        )}
        <ViewportHUD
          topLeft={
            <div className="flex flex-col gap-2">
              <ViewportToolModeToolbar />
              <ViewportCameraToolbar sceneGraph={sceneGraph} />
            </div>
          }
          bottomLeft={
            activeMode === 'create-joint' ? (
              <JointCreationStatus />
            ) : activeMode === 'create-datum' ? (
              <DatumCreationStatus />
            ) : undefined
          }
          bottomCenter={
            selectedEntity ? (
              <SelectionChip
                icon={<SelectionIcon entityType={selectedEntity.entityType} />}
                name={selectedEntity.name}
              />
            ) : undefined
          }
        />
        <JointConfigDialog />
      </div>
    </ViewportContextMenu>
  );
}
