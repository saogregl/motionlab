import { ConnectionBanner, SelectionChip, ViewportHUD, useTheme } from '@motionlab/ui';
import type { DatumPreviewType, SceneGraphManager } from '@motionlab/viewport';
import { Viewport } from '@motionlab/viewport';
import { Box, Cog, Crosshair, Link2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useViewportBridge } from '../hooks/useViewportBridge.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { useTraceStore } from '../stores/traces.js';
import { nearestSample } from '../utils/nearest-sample.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';
import { JointHoverBadge } from './JointHoverBadge.js';
import { JointTypeSelectorPanel } from './JointTypeSelectorPanel.js';
import { LoadCreationCard } from './LoadCreationCard.js';
import { ModeIndicator } from './ModeIndicator.js';
import { ViewportContextMenu } from './ViewportContextMenu.js';
import { ViewportToolModeToolbar } from './ViewportToolModeToolbar.js';
import { FaceTooltip } from './FaceTooltip.js';
import { WorldSpaceOverlay } from './WorldSpaceOverlay.js';

function SelectionIcon({ entityType }: { entityType: 'body' | 'datum' | 'joint' | 'load' | 'actuator' }) {
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
      <div className="rounded bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm whitespace-nowrap border border-[var(--success)]/40">
        Parent: {parentDatum?.name ?? '?'} (on {parentBody?.name ?? '?'})
      </div>
    </WorldSpaceOverlay>
  );
}

const PANEL_FLOAT_INSET = 6;

export function ViewportOverlay() {
  const { handleSceneReady, handlePick, handleHover, sceneGraphRef } = useViewportBridge();
  const { theme } = useTheme();
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);
  const activeMode = useToolModeStore((s) => s.activeMode);
  const selectedEntity = useSelectedEntity();
  const activeWorkspace = useUILayoutStore((s) => s.activeWorkspace);
  const rightPanelOpen = useUILayoutStore((s) => s.rightPanelOpen);
  const rightPanelWidth = useUILayoutStore((s) => s.rightPanelWidth);
  const rightPanelInset = activeWorkspace === 'build' && rightPanelOpen ? rightPanelWidth + 2 * PANEL_FLOAT_INSET : 0;
  const bottomDockExpanded = useUILayoutStore((s) => s.bottomDockExpanded);
  const resultsBottomDockExpanded = useUILayoutStore((s) => s.resultsBottomDockExpanded);
  const isBottomDockExpanded = activeWorkspace === 'build' ? bottomDockExpanded : resultsBottomDockExpanded;
  const bottomDockInset = PANEL_FLOAT_INSET + (isBottomDockExpanded ? 240 : 32) + PANEL_FLOAT_INSET;
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
        const value = samples ? nearestSample(samples, simTime)?.value ?? null : null;
        sg.updateJointLimitValue(id, value);
      }
    };

    syncSelectedJointLimits();

    const unsubSim = useSimulationStore.subscribe((state, prev) => {
      if (state.simTime === prev.simTime && state.state === prev.state) return;
      syncSelectedJointLimits();
    });
    const unsubTrace = useTraceStore.subscribe((state, prev) => {
      if (state.traces === prev.traces) return;
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
    if (activeMode !== 'create-datum') {
      useAuthoringStatusStore.getState().clearMessage();
      return;
    }
    useSelectionStore.getState().setHovered(null);
  }, [activeMode]);

  useEffect(() => {
    if (activeMode === 'create-load') return;
    sceneGraphRef.current?.clearLoadPreview();
  }, [activeMode, sceneGraphRef]);

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
          rightPanelInset={rightPanelInset}
          bottomDockInset={bottomDockInset}
          theme={theme}
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
        <JointCreationDatumLabel sceneGraph={sceneGraph} />
        <JointHoverBadge sceneGraph={sceneGraph} />
      </div>
    </ViewportContextMenu>
  );
}
