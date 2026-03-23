import { ConnectionBanner, SelectionChip, ViewportHUD } from '@motionlab/ui';
import type { DatumPreviewType, SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { Box, Crosshair, Link2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { JointTypeSelectorPanel } from './JointTypeSelectorPanel.js';
import { LoadCreationCard } from './LoadCreationCard.js';
import { ModeIndicator } from './ModeIndicator.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';
import { FaceTooltip } from './FaceTooltip.js';
import { WorldSpaceOverlay } from './WorldSpaceOverlay.js';

function SelectionIcon({ entityType }: { entityType: 'body' | 'datum' | 'joint' | 'load' }) {
  switch (entityType) {
    case 'body':
      return <Box className="size-3.5" />;
    case 'datum':
      return <Crosshair className="size-3.5" />;
    case 'joint':
      return <Link2 className="size-3.5" />;
    case 'load':
      return <Zap className="size-3.5" />;
  }
}

function JointCreationStatus() {
  const step = useJointCreationStore((s) => s.step);
  const creatingDatum = useJointCreationStore((s) => s.creatingDatum);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const message = useAuthoringStatusStore((s) => s.message);

  const statusClass = 'rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm';

  if (creatingDatum) {
    return <div className={statusClass}>Creating datum...</div>;
  }
  if (step === 'pick-parent') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>Click a datum or face to set as parent</div>
        {message ? <div className={statusClass}>{message}</div> : null}
      </div>
    );
  }
  if (step === 'pick-child') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>
          Parent: {parentDatum?.name ?? '?'}. Click a datum or face on another body
        </div>
        {message ? <div className={statusClass}>{message}</div> : null}
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

function LoadCreationStatus() {
  const step = useLoadCreationStore((s) => s.step);
  const datumId = useLoadCreationStore((s) => s.datumId);
  const datum = useMechanismStore((s) => (datumId ? s.datums.get(datumId) : undefined));

  const statusClass =
    'rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm';

  if (step === 'pick-datum') {
    return <div className={statusClass}>Click a datum to apply the load</div>;
  }
  if (step === 'pick-second-datum') {
    return (
      <div className={statusClass}>
        First datum: {datum?.name ?? '?'}. Click a second datum for the spring-damper
      </div>
    );
  }
  return null;
}

function useSelectedEntity() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const loads = useMechanismStore((s) => s.loads);

  return useMemo(() => {
    if (selectedIds.size === 0) return null;
    if (selectedIds.size === 1) {
      const id = selectedIds.values().next().value as string;
      const body = bodies.get(id);
      if (body) return { id, name: body.name, entityType: 'body' as const };
      const datum = datums.get(id);
      if (datum) return { id, name: datum.name, entityType: 'datum' as const };
      const joint = joints.get(id);
      if (joint) return { id, name: joint.name, entityType: 'joint' as const };
      const load = loads.get(id);
      if (load) return { id, name: load.name, entityType: 'load' as const };
      return null;
    }
    return { id: '', name: `${selectedIds.size} entities`, entityType: null };
  }, [selectedIds, bodies, datums, joints, loads]);
}

function JointCreationDatumLabel({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const parentBody = useMechanismStore((s) =>
    parentDatum ? s.bodies.get(parentDatum.parentBodyId) : undefined,
  );

  const showLabel = (step === 'pick-child' || step === 'select-type') && parentDatumId && sceneGraph;
  if (!showLabel) return null;

  // Get the world position of the parent datum
  const worldPosition = sceneGraph.getEntityWorldPosition(parentDatumId);
  if (!worldPosition) return null;

  return (
    <WorldSpaceOverlay
      worldPosition={worldPosition}
      sceneGraph={sceneGraph}
      offset={{ x: 0, y: -8 }}
    >
      <div className="rounded bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm whitespace-nowrap border border-emerald-500/40">
        Parent: {parentDatum?.name ?? '?'} (on {parentBody?.name ?? '?'})
      </div>
    </WorldSpaceOverlay>
  );
}

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover, sceneGraphRef } = useViewportBridge();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);
  const activeMode = useToolModeStore((s) => s.activeMode);
  const selectedEntity = useSelectedEntity();
  const [hoveredFace, setHoveredFace] = useState<{ bodyId: string; faceIndex: number; previewType?: DatumPreviewType } | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const connStatus = useEngineConnection((s) => s.status);
  const connError = useEngineConnection((s) => s.errorMessage);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const showBanner = !bannerDismissed && connStatus !== 'ready' && connStatus !== 'discovering';

  const onReady = useCallback(
    (sg: SceneGraphManager) => {
      setSceneGraph(sg);
      handleSceneReady(sg);
    },
    [handleSceneReady],
  );

  // Visual feedback: highlight datums, dim same-body datums, show connector line
  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const unsub = useJointCreationStore.subscribe((state, prev) => {
      const isJointStep = state.step === 'pick-child' || state.step === 'select-type';
      const wasJointStep = prev.step === 'pick-child' || prev.step === 'select-type';

      // Entering a highlighting step
      if (isJointStep && state.parentDatumId) {
        // Dim same-body datums when parent is selected
        if (state.step === 'pick-child' && prev.step !== 'pick-child' && prev.step !== 'select-type') {
          const parentDatum = useMechanismStore.getState().datums.get(state.parentDatumId);
          if (parentDatum) {
            sg.dimDatumsByBody(parentDatum.parentBodyId);
          }
        }

        // Apply parent/child highlights
        sg.applyJointCreationHighlights(state.parentDatumId, state.childDatumId);

        // Show connector preview line when both datums selected
        if (state.step === 'select-type' && state.childDatumId) {
          sg.showJointPreviewLine(state.parentDatumId, state.childDatumId);
        } else {
          sg.clearJointPreviewLine();
        }
      }

      // Leaving a highlighting step
      if (wasJointStep && !isJointStep) {
        sg.restoreDimmedDatums();
        sg.clearJointCreationHighlights();
        sg.clearJointPreviewLine();
      }

      // Re-dim when going back from select-type to pick-child (ESC undo)
      if (state.step === 'pick-child' && prev.step === 'select-type' && state.parentDatumId) {
        sg.clearJointPreviewLine();
        // Re-apply highlights without child
        sg.applyJointCreationHighlights(state.parentDatumId, null);
      }
    });

    return unsub;
  }, [sceneGraphRef]);

  useEffect(() => {
    if (activeMode !== 'create-datum') {
      useAuthoringStatusStore.getState().clearMessage();
      return;
    }
    useSelectionStore.getState().setHovered(null);
  }, [activeMode]);

  const cursorMode = activeMode === 'create-datum' || activeMode === 'create-joint' || activeMode === 'create-load';

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
          topCenter={
            showBanner ? (
              <ConnectionBanner
                status={connStatus === 'error' ? 'error' : connStatus === 'disconnected' ? 'disconnected' : 'connecting'}
                errorMessage={connError ?? undefined}
                onDismiss={() => setBannerDismissed(true)}
              />
            ) : undefined
          }
          bottomLeft={
            activeMode === 'create-joint' ? (
              <JointCreationStatus />
            ) : activeMode === 'create-datum' ? (
              <DatumCreationStatus />
            ) : activeMode === 'create-load' ? (
              <LoadCreationStatus />
            ) : undefined
          }
          bottomCenter={
            selectedEntity ? (
              <SelectionChip
                icon={
                  selectedEntity.entityType ? (
                    <SelectionIcon entityType={selectedEntity.entityType} />
                  ) : undefined
                }
                name={selectedEntity.name}
              />
            ) : undefined
          }
        />
        <ModeIndicator />
        <JointTypeSelectorPanel />
        <LoadCreationCard />
        <JointCreationDatumLabel sceneGraph={sceneGraph} />
      </div>
    </ViewportContextMenu>
  );
}
