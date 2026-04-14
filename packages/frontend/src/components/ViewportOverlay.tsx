import { ConnectionBanner, SelectionChip, useTheme, ViewportHUD } from '@motionlab/ui';
import type { DatumPreviewType, SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { Box, Cog, Crosshair, Link2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sendPrepareFacePicking } from '../engine/connection.js';
import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

import { useTraceStore } from '../stores/traces.js';
import { nearestSample } from '../utils/nearest-sample.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';
import { EntityLabelOverlay } from './EntityLabelOverlay.js';
import { FaceTooltip } from './FaceTooltip.js';
import { JointTypeSelectorPanel } from './JointTypeSelectorPanel.js';
import { LoadCreationCard } from './LoadCreationCard.js';
import { ModeIndicator } from './ModeIndicator.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';
import { ViewportToolModeToolbar } from './ViewportToolModeToolbar.js';
import { WorldSpaceOverlay } from './WorldSpaceOverlay.js';

function SelectionIcon({
  entityType,
}: {
  entityType: 'body' | 'datum' | 'joint' | 'load' | 'actuator';
}) {
  switch (entityType) {
    case 'body':
      return <Box className="size-3.5" />;
    case 'datum':
      return <Crosshair className="size-3.5" />;
    case 'joint':
      return <Link2 className="size-3.5" />;
    case 'load':
      return <Zap className="size-3.5" />;
    case 'actuator':
      return <Cog className="size-3.5" />;
  }
}

function JointCreationStatus() {
  const step = useJointCreationStore((s) => s.step);
  const creatingDatum = useJointCreationStore((s) => s.creatingDatum);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const parentBody = useMechanismStore((s) =>
    parentDatum ? s.bodies.get(parentDatum.parentBodyId) : undefined,
  );
  const message = useAuthoringStatusStore((s) => s.message);

  const statusClass =
    'rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm';

  if (creatingDatum) {
    return <div className={statusClass}>Setting joint anchor...</div>;
  }
  if (step === 'pick-parent') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>Click a surface on the first body</div>
        {message ? <div className={statusClass}>{message}</div> : null}
      </div>
    );
  }
  if (step === 'pick-child') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>
          {parentBody?.name ?? parentDatum?.name ?? 'Body A'} selected. Click a surface on the
          second body
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
  const creatingDatum = useLoadCreationStore((s) => s.creatingDatum);
  const datum = useMechanismStore((s) => (datumId ? s.datums.get(datumId) : undefined));
  const message = useAuthoringStatusStore((s) => s.message);

  const statusClass =
    'rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm';

  if (creatingDatum) {
    return <div className={statusClass}>Creating datum...</div>;
  }
  if (step === 'pick-datum') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>Click a datum or face to apply the load</div>
        {message ? <div className={statusClass}>{message}</div> : null}
      </div>
    );
  }
  if (step === 'pick-second-datum') {
    return (
      <div className="flex flex-col gap-1">
        <div className={statusClass}>
          Anchor: {datum?.name ?? '?'}. Click a second datum or face for the spring-damper
        </div>
        {message ? <div className={statusClass}>{message}</div> : null}
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
  const actuators = useMechanismStore((s) => s.actuators);

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
      const actuator = actuators.get(id);
      if (actuator) return { id, name: actuator.name, entityType: 'actuator' as const };
      return null;
    }
    return { id: '', name: `${selectedIds.size} entities`, entityType: null };
  }, [selectedIds, bodies, datums, joints, loads, actuators]);
}

function JointCreationDatumLabels({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const childDatumId = useJointCreationStore((s) => s.childDatumId);
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const parentBody = useMechanismStore((s) =>
    parentDatum ? s.bodies.get(parentDatum.parentBodyId) : undefined,
  );
  const childDatum = useMechanismStore((s) =>
    childDatumId ? s.datums.get(childDatumId) : undefined,
  );
  const childBody = useMechanismStore((s) =>
    childDatum ? s.bodies.get(childDatum.parentBodyId) : undefined,
  );

  const showParent =
    (step === 'pick-child' || step === 'select-type') && parentDatumId && sceneGraph;
  const showChild = step === 'select-type' && childDatumId && sceneGraph;

  return (
    <>
      {showParent &&
        (() => {
          const worldPosition = sceneGraph.getEntityWorldPosition(parentDatumId);
          if (!worldPosition) return null;
          return (
            <WorldSpaceOverlay
              worldPosition={worldPosition}
              sceneGraph={sceneGraph}
              offset={{ x: 0, y: -10 }}
            >
              <div className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm whitespace-nowrap border border-[var(--success)]/70 flex items-center gap-1">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[var(--success)]/20 text-[9px] font-semibold text-[var(--success)]">
                  A
                </span>
                {parentBody?.name ?? parentDatum?.name ?? '?'}
              </div>
            </WorldSpaceOverlay>
          );
        })()}
      {showChild &&
        (() => {
          const worldPosition = sceneGraph.getEntityWorldPosition(childDatumId);
          if (!worldPosition) return null;
          return (
            <WorldSpaceOverlay
              worldPosition={worldPosition}
              sceneGraph={sceneGraph}
              offset={{ x: 0, y: -10 }}
            >
              <div className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm whitespace-nowrap border border-[var(--accent-primary)]/70 flex items-center gap-1">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[var(--accent-primary)]/20 text-[9px] font-semibold text-[var(--accent-primary)]">
                  B
                </span>
                {childBody?.name ?? childDatum?.name ?? '?'}
              </div>
            </WorldSpaceOverlay>
          );
        })()}
    </>
  );
}

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover, sceneGraphRef } = useViewportBridge();
  const { theme } = useTheme();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);
  const activeMode = useToolModeStore((s) => s.activeMode);
  const gridVisible = useToolModeStore((s) => s.gridVisible);
  const selectedEntity = useSelectedEntity();
  const [hoveredFace, setHoveredFace] = useState<{
    bodyId: string;
    faceIndex: number;
    previewType?: DatumPreviewType;
  } | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const connStatus = useEngineConnection((s) => s.status);
  const connError = useEngineConnection((s) => s.errorMessage);
  const geometries = useMechanismStore((s) => s.geometries);
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
        if (
          state.step === 'pick-child' &&
          prev.step !== 'pick-child' &&
          prev.step !== 'select-type'
        ) {
          const parentDatum = useMechanismStore.getState().datums.get(state.parentDatumId);
          if (parentDatum) {
            sg.dimDatumsByBody(parentDatum.parentBodyId);
          }
        }

        // Apply parent/child highlights
        sg.applyJointCreationHighlights(state.parentDatumId, state.childDatumId);

        // Show connector preview line when both datums selected
        if (state.step === 'select-type' && state.childDatumId) {
          sg.clearProvisionalJointPreview();
          sg.showJointPreviewLine(state.parentDatumId, state.childDatumId, state.alignment);

          // Show DOF indicator for auto-selected type on step entry
          if (prev.step !== 'select-type' && state.selectedJointType) {
            sg.showJointTypePreview(
              state.selectedJointType,
              state.parentDatumId,
              state.childDatumId,
              state.alignment?.axis ?? null,
            );
          }
        } else {
          sg.clearJointPreviewLine();
        }

        // DOF preview: react to previewJointType hover changes
        if (state.step === 'select-type' && state.parentDatumId && state.childDatumId) {
          if (state.previewJointType !== prev.previewJointType) {
            if (state.previewJointType) {
              sg.showJointTypePreview(
                state.previewJointType,
                state.parentDatumId,
                state.childDatumId,
                state.alignment?.axis ?? null,
              );
            } else {
              sg.clearJointTypePreview();
              // When mouse leaves selector, show selected type's indicator
              if (state.selectedJointType) {
                sg.showJointTypePreview(
                  state.selectedJointType,
                  state.parentDatumId,
                  state.childDatumId,
                  state.alignment?.axis ?? null,
                );
              }
            }
          }
          // React to selectedJointType changes (clicking a type)
          if (state.selectedJointType !== prev.selectedJointType && !state.previewJointType) {
            if (state.selectedJointType) {
              sg.showJointTypePreview(
                state.selectedJointType,
                state.parentDatumId,
                state.childDatumId,
                state.alignment?.axis ?? null,
              );
            } else {
              sg.clearJointTypePreview();
            }
          }
        }
      }

      // Leaving a highlighting step
      if (wasJointStep && !isJointStep) {
        sg.restoreDimmedDatums();
        sg.clearJointCreationHighlights();
        sg.clearJointPreviewLine();
        sg.clearJointTypePreview();
        sg.clearProvisionalJointPreview();
      }

      // Re-dim when going back from select-type to pick-child (ESC undo)
      if (state.step === 'pick-child' && prev.step === 'select-type' && state.parentDatumId) {
        sg.clearJointPreviewLine();
        sg.clearJointTypePreview();
        // Re-apply highlights without child
        sg.applyJointCreationHighlights(state.parentDatumId, null);
      }
    });

    return unsub;
  }, [sceneGraph, sceneGraphRef]);

  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const syncSelectedJointLimits = () => {
      const simState = useSimulationStore.getState().state;
      const simTime = useSimulationStore.getState().simTime;
      const { traces } = useTraceStore.getState();
      const { joints } = useMechanismStore.getState();
      const { selectedIds } = useSelectionStore.getState();
      const isSimulating = simState === 'running' || simState === 'paused';

      for (const id of selectedIds) {
        if (!joints.has(id)) continue;
        if (!isSimulating) {
          sg.updateJointLimitValue(id, null);
          continue;
        }

        const joint = joints.get(id);
        const channelId = joint ? getJointCoordinateChannelIds(id, joint.type)?.position : null;
        const samples = channelId ? traces.get(channelId) : undefined;
        const value = samples ? (nearestSample(samples, simTime)?.value ?? null) : null;
        sg.updateJointLimitValue(id, value);
      }
    };

    syncSelectedJointLimits();

    const unsubSim = useSimulationStore.subscribe((state, prev) => {
      if (state.simTime === prev.simTime && state.state === prev.state) return;
      syncSelectedJointLimits();
    });
    const unsubTrace = useTraceStore.subscribe((state, prev) => {
      // Only sync when channels relevant to selected joints received new data.
      // The old `state.traces === prev.traces` guard never short-circuited
      // because flushPendingTraces creates a new Map each flush.
      if (state.lastUpdatedChannels.size === 0) return;
      const { selectedIds } = useSelectionStore.getState();
      const { joints } = useMechanismStore.getState();
      let relevant = false;
      for (const id of selectedIds) {
        const joint = joints.get(id);
        const chId = joint ? getJointCoordinateChannelIds(id, joint.type)?.position : null;
        if (chId && state.lastUpdatedChannels.has(chId)) {
          relevant = true;
          break;
        }
      }
      if (!relevant) return;
      syncSelectedJointLimits();
    });
    const unsubSelection = useSelectionStore.subscribe((state, prev) => {
      if (state.selectedIds === prev.selectedIds) return;
      syncSelectedJointLimits();
    });

    return () => {
      unsubSim();
      unsubTrace();
      unsubSelection();
    };
  }, [sceneGraph, sceneGraphRef]);

  useEffect(() => {
    if (activeMode !== 'create-datum' && activeMode !== 'create-joint') {
      useAuthoringStatusStore.getState().clearMessage();
      return;
    }
    useSelectionStore.getState().setHovered(null);
  }, [activeMode]);

  useEffect(() => {
    if (connStatus !== 'ready') return;
    if (activeMode !== 'create-datum' && activeMode !== 'create-joint') return;

    const geometryIds = Array.from(geometries.keys());
    if (geometryIds.length === 0) return;
    sendPrepareFacePicking(geometryIds);
  }, [activeMode, connStatus, geometries]);

  useEffect(() => {
    if (activeMode === 'create-load') return;
    sceneGraphRef.current?.clearLoadPreview();
  }, [activeMode, sceneGraphRef]);

  // Provisional connector preview: show dashed line from parent datum to cursor during pick-child
  const jointStep = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);

  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    if (activeMode !== 'create-joint' || jointStep !== 'pick-child' || !parentDatumId) {
      sg.clearProvisionalJointPreview();
      return;
    }

    if (hoveredFace) {
      const previewPos = sg.getDatumPreviewPosition();
      if (previewPos) {
        sg.showProvisionalJointPreview(parentDatumId, previewPos);
        // Show a spatial DOF indicator at the hover position for the inferred type
        const inferredType =
          hoveredFace.previewType === 'axis'
            ? 'revolute'
            : hoveredFace.previewType === 'plane'
              ? 'planar'
              : hoveredFace.previewType === 'point'
                ? 'spherical'
                : null;
        if (inferredType) {
          sg.showProvisionalDofPreview(previewPos, inferredType);
        }
      }
    } else {
      sg.clearProvisionalJointPreview();
    }
  }, [activeMode, jointStep, parentDatumId, hoveredFace, sceneGraphRef]);

  const cursorMode =
    activeMode === 'create-datum' || activeMode === 'create-joint' || activeMode === 'create-load';

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
          gridVisible={gridVisible}
          theme={theme}
        />
        {(activeMode === 'create-datum' || activeMode === 'create-joint') && (
          <FaceTooltip
            containerRef={viewportContainerRef}
            hoveredFace={hoveredFace}
            mode={activeMode}
          />
        )}
        <ViewportHUD
          topCenter={
            showBanner ? (
              <ConnectionBanner
                status={
                  connStatus === 'error'
                    ? 'error'
                    : connStatus === 'disconnected'
                      ? 'disconnected'
                      : 'connecting'
                }
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
        {/* Floating tool mode toolbar — left side, panel-aware */}
        <div
          className="pointer-events-auto absolute z-[var(--z-toolbar)] -translate-y-1/2"
          style={{
            insetInlineStart: 'calc(var(--vp-inset-left, 0px) + 12px)',
            top: 'calc((100% - var(--vp-inset-bottom, 0px)) / 2)',
          }}
        >
          <ViewportToolModeToolbar />
        </div>
        <ModeIndicator />
        <JointTypeSelectorPanel />
        <LoadCreationCard sceneGraph={sceneGraph} />
        <JointCreationDatumLabels sceneGraph={sceneGraph} />
        <EntityLabelOverlay sceneGraph={sceneGraph} />
      </div>
    </ViewportContextMenu>
  );
}
