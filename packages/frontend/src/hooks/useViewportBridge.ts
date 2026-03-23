import type { SceneGraphManager, SpatialPickData } from '@motionlab/viewport';
import { useCallback, useEffect, useRef } from 'react';

import {
  registerSceneGraph,
  sendCreateDatumFromFace,
  sendUpdateDatumPose,
} from '../engine/connection.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import type { BodyPose } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useVisibilityStore } from '../stores/visibility.js';
import { analyzeDatumAlignment, computeDatumWorldPose } from '../utils/datum-alignment.js';
import { resolveDatumFacePick } from '../utils/datum-face-pick.js';
import { nextDatumName } from '../utils/datum-naming.js';
import { mergeGeometryMeshes } from '../utils/merge-geometry-meshes.js';
import {
  resolveViewportEntityId,
  resolveViewportEntityIds,
} from '../utils/viewport-entity-resolution.js';

/** Convert {x,y,z} pose format to [x,y,z] tuple format used by SceneGraphManager. */
function convertPose(pose: BodyPose) {
  return {
    position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
    rotation: [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w] as [
      number,
      number,
      number,
      number,
    ],
  };
}

export function useViewportBridge() {
  const sceneGraphRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sceneGraph: SceneGraphManager) => {
    sceneGraphRef.current = sceneGraph;
    registerSceneGraph(sceneGraph);

    // Initial sync: add any bodies already in the store
    const { bodies, geometries, datums, joints } = useMechanismStore.getState();
    for (const body of bodies.values()) {
      const bodyGeoms = [...geometries.values()].filter((g) => g.parentBodyId === body.id);
      if (bodyGeoms.length === 0) continue;
      const merged = mergeGeometryMeshes(bodyGeoms);
      sceneGraph.addBody(
        body.id,
        body.name,
        merged.meshData,
        convertPose(body.pose),
        merged.partIndex,
      );
    }

    // Initial sync: add any datums already in the store
    for (const datum of datums.values()) {
      sceneGraph.addDatum(datum.id, datum.parentBodyId, convertPose(datum.localPose), datum.name);
    }

    // Initial sync: add any joints already in the store (after datums)
    for (const joint of joints.values()) {
      sceneGraph.addJoint(joint.id, joint.parentDatumId, joint.childDatumId, joint.type);
    }

    if (bodies.size > 0) {
      sceneGraph.fitAll();
    }

    // Sync current selection
    const { selectedIds, hoveredId } = useSelectionStore.getState();
    sceneGraph.applySelection(resolveViewportEntityIds(selectedIds, bodies, geometries));
    sceneGraph.applyHover(resolveViewportEntityId(hoveredId, bodies, geometries));

    // Wire gizmo drag-end to send update command and refresh dependent joint visuals
    sceneGraph.setGizmoOnDragEnd((event) => {
      sendUpdateDatumPose(event.entityId, {
        position: { x: event.position[0], y: event.position[1], z: event.position[2] },
        orientation: { x: event.rotation[0], y: event.rotation[1], z: event.rotation[2], w: event.rotation[3] },
      });
      sceneGraph.refreshJointPositions();
    });
  }, []);

  // Store subscriptions — set up after scene is ready, tear down on unmount
  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const trackedBodyIds = new Set<string>(useMechanismStore.getState().bodies.keys());
    const trackedGeometryIds = new Set<string>(useMechanismStore.getState().geometries.keys());
    const trackedDatumIds = new Set<string>(useMechanismStore.getState().datums.keys());
    const trackedJointIds = new Set<string>(useMechanismStore.getState().joints.keys());
    const trackedLoadIds = new Set<string>(useMechanismStore.getState().loads.keys());

    const unsubMechanism = useMechanismStore.subscribe((state) => {
      // --- Geometry diff — identify bodies that need mesh rebuild ---
      const currentGeometryIds = new Set<string>(state.geometries.keys());
      const bodiesNeedingRebuild = new Set<string>();

      for (const id of currentGeometryIds) {
        if (!trackedGeometryIds.has(id)) {
          const geom = state.geometries.get(id);
          if (geom?.parentBodyId) bodiesNeedingRebuild.add(geom.parentBodyId);
        }
      }
      for (const id of trackedGeometryIds) {
        if (!currentGeometryIds.has(id)) {
          // Geometry was removed — find its former parent from tracked bodies
          // We can't look it up since it's gone, but the body diff below will handle removal
          // For attach/detach, the store action triggers a geometry update which we catch here
        }
      }

      trackedGeometryIds.clear();
      for (const id of currentGeometryIds) trackedGeometryIds.add(id);

      // --- Body diff ---
      const currentBodyIds = new Set<string>(state.bodies.keys());

      for (const id of currentBodyIds) {
        if (!trackedBodyIds.has(id)) {
          // New body — add with merged geometry meshes
          const body = state.bodies.get(id);
          if (!body) continue;
          const bodyGeoms = [...state.geometries.values()].filter((g) => g.parentBodyId === body.id);
          if (bodyGeoms.length === 0) continue;
          const merged = mergeGeometryMeshes(bodyGeoms);
          sg.addBody(
            body.id,
            body.name,
            merged.meshData,
            convertPose(body.pose),
            merged.partIndex,
          );
        } else if (bodiesNeedingRebuild.has(id)) {
          // Body exists but geometries changed — rebuild mesh
          const body = state.bodies.get(id);
          if (!body) continue;
          sg.removeBody(id);
          const bodyGeoms = [...state.geometries.values()].filter((g) => g.parentBodyId === body.id);
          if (bodyGeoms.length > 0) {
            const merged = mergeGeometryMeshes(bodyGeoms);
            sg.addBody(
              body.id,
              body.name,
              merged.meshData,
              convertPose(body.pose),
              merged.partIndex,
            );
          }
        }
      }

      for (const id of trackedBodyIds) {
        if (!currentBodyIds.has(id)) {
          sg.removeBody(id);
        }
      }

      const hadBodies = trackedBodyIds.size > 0;
      trackedBodyIds.clear();
      for (const id of currentBodyIds) trackedBodyIds.add(id);

      if (!hadBodies && trackedBodyIds.size > 0) {
        sg.fitAll();
      }

      // --- Datum diff ---
      const currentDatumIds = new Set<string>(state.datums.keys());

      for (const id of currentDatumIds) {
        if (!trackedDatumIds.has(id)) {
          const datum = state.datums.get(id);
          if (!datum) continue;
          sg.addDatum(datum.id, datum.parentBodyId, convertPose(datum.localPose), datum.name);
        }
      }

      for (const id of trackedDatumIds) {
        if (!currentDatumIds.has(id)) {
          sg.removeDatum(id);
        }
      }

      trackedDatumIds.clear();
      for (const id of currentDatumIds) trackedDatumIds.add(id);

      // --- Joint diff (runs after datum diff so datum entities exist) ---
      const currentJointIds = new Set<string>(state.joints.keys());

      for (const id of currentJointIds) {
        if (!trackedJointIds.has(id)) {
          const joint = state.joints.get(id);
          if (!joint) continue;
          sg.addJoint(joint.id, joint.parentDatumId, joint.childDatumId, joint.type);
        }
      }

      for (const id of trackedJointIds) {
        if (!currentJointIds.has(id)) {
          sg.removeJoint(id);
        }
      }

      // Check for joint type updates on existing joints
      for (const id of currentJointIds) {
        if (trackedJointIds.has(id)) {
          const joint = state.joints.get(id);
          if (!joint) continue;
          const entity = sg.getEntity(id);
          if (entity) {
            // We track type changes by comparing with stored metadata
            const meta = entity.rootNode.metadata as { jointType?: string } | undefined;
            if (meta?.jointType !== undefined && meta.jointType !== joint.type) {
              sg.updateJoint(id, joint.type);
            }
          }
        }
      }

      trackedJointIds.clear();
      for (const id of currentJointIds) trackedJointIds.add(id);

      // --- Load diff ---
      const currentLoadIds = new Set<string>(state.loads.keys());

      for (const id of currentLoadIds) {
        if (!trackedLoadIds.has(id)) {
          const load = state.loads.get(id);
          if (!load) continue;
          sg.addLoadVisual(load.id, load);
        }
      }

      for (const id of trackedLoadIds) {
        if (!currentLoadIds.has(id)) {
          sg.removeLoadVisual(id);
        }
      }

      trackedLoadIds.clear();
      for (const id of currentLoadIds) trackedLoadIds.add(id);
    });

    const unsubSelection = useSelectionStore.subscribe((state) => {
      const { bodies, geometries } = useMechanismStore.getState();
      sg.applySelection(resolveViewportEntityIds(state.selectedIds, bodies, geometries));

      // Attach gizmo when a single datum is selected
      const { gizmoMode } = useToolModeStore.getState();
      if (state.selectedIds.size === 1 && gizmoMode !== 'off') {
        const id = state.selectedIds.values().next().value as string;
        const { datums } = useMechanismStore.getState();
        if (datums.has(id)) {
          sg.attachGizmo(id);
        } else {
          sg.detachGizmo();
        }
      } else {
        sg.detachGizmo();
      }
    });

    const unsubHover = useSelectionStore.subscribe((state) => {
      const { bodies, geometries } = useMechanismStore.getState();
      sg.applyHover(resolveViewportEntityId(state.hoveredId, bodies, geometries));
    });

    // Sync visibility changes
    const unsubVisibility = useVisibilityStore.subscribe((state) => {
      for (const entity of sg.getAllEntities()) {
        sg.setEntityVisibility(entity.id, !state.hiddenIds.has(entity.id));
      }
    });

    // Sync gizmo mode changes
    const unsubGizmoMode = useToolModeStore.subscribe((state) => {
      sg.setGizmoMode(state.gizmoMode);

      // Re-evaluate gizmo attachment with new mode
      const { selectedIds } = useSelectionStore.getState();
      if (selectedIds.size === 1 && state.gizmoMode !== 'off') {
        const id = selectedIds.values().next().value as string;
        const { datums } = useMechanismStore.getState();
        if (datums.has(id)) {
          sg.attachGizmo(id);
        }
      } else {
        sg.detachGizmo();
      }
    });

    return () => {
      unsubMechanism();
      unsubSelection();
      unsubHover();
      unsubVisibility();
      unsubGizmoMode();
      registerSceneGraph(null);
    };
  }, []);

  const handlePick = useCallback(
    (
      entityId: string | null,
      modifiers: { ctrl: boolean; shift: boolean },
      spatial?: SpatialPickData,
    ) => {
      const mode = useToolModeStore.getState().activeMode;
      const simState = useSimulationStore.getState().state;
      const isSimulating = simState === 'running' || simState === 'paused';

      if (isSimulating && (mode === 'create-datum' || mode === 'create-joint' || mode === 'create-load')) {
        return;
      }

      if (mode === 'create-datum') {
        const { bodies, datums } = useMechanismStore.getState();
        const resolution = resolveDatumFacePick(entityId, bodies, spatial);
        if (resolution.kind === 'ignore') {
          return;
        }
        if (resolution.kind === 'error') {
          useAuthoringStatusStore.getState().setMessage(resolution.message);
          return;
        }
        const name = nextDatumName(datums);
        sendCreateDatumFromFace(resolution.bodyId, resolution.faceIndex, name);
        return;
      }

      if (mode === 'create-joint') {
        const creationState = useJointCreationStore.getState();

        // Block picks while waiting for async face-to-datum creation
        if (creationState.creatingDatum) return;
        if (!entityId) return;

        const { bodies, datums } = useMechanismStore.getState();

        // Helper: advance pick-child with alignment computation
        const advanceChildDatum = (childDatumId: string) => {
          const parentDatum = creationState.parentDatumId
            ? datums.get(creationState.parentDatumId)
            : undefined;
          const childDatum = datums.get(childDatumId);
          if (!parentDatum || !childDatum) return;

          const parentBody = bodies.get(parentDatum.parentBodyId);
          const childBody = bodies.get(childDatum.parentBodyId);
          if (parentBody && childBody) {
            const alignment = analyzeDatumAlignment(
              computeDatumWorldPose(parentBody.pose, parentDatum.localPose),
              computeDatumWorldPose(childBody.pose, childDatum.localPose),
            );
            creationState.setChildDatum(childDatumId, alignment);
          } else {
            creationState.setChildDatum(childDatumId);
          }
        };

        // Check if pick is on an existing datum
        if (datums.has(entityId)) {
          if (creationState.step === 'pick-parent') {
            creationState.setParentDatum(entityId);
            return;
          }

          if (creationState.step === 'pick-child') {
            const parentDatum = creationState.parentDatumId
              ? datums.get(creationState.parentDatumId)
              : undefined;
            const childDatum = datums.get(entityId);
            if (!parentDatum || !childDatum) return;

            if (parentDatum.parentBodyId === childDatum.parentBodyId) {
              useAuthoringStatusStore.getState().setMessage(
                'Cannot create joint: parent and child datums must be on different bodies',
              );
              return;
            }

            advanceChildDatum(entityId);
            return;
          }

          return;
        }

        // Face-to-datum shortcut: pick resolved to a body face → auto-create datum
        if (creationState.step === 'pick-parent' || creationState.step === 'pick-child') {
          const resolution = resolveDatumFacePick(entityId, bodies, spatial);
          if (resolution.kind === 'create') {
            // For pick-child, validate the face is on a different body
            if (creationState.step === 'pick-child') {
              const parentDatum = creationState.parentDatumId
                ? datums.get(creationState.parentDatumId)
                : undefined;
              if (parentDatum && parentDatum.parentBodyId === resolution.bodyId) {
                useAuthoringStatusStore.getState().setMessage(
                  'Cannot create joint: parent and child datums must be on different bodies',
                );
                return;
              }
            }
            creationState.setCreatingDatum(true);
            useAuthoringStatusStore.getState().setMessage('Creating datum...');
            const name = nextDatumName(datums);
            sendCreateDatumFromFace(resolution.bodyId, resolution.faceIndex, name);
          }
        }

        return;
      }

      if (mode === 'create-load') {
        if (!entityId) return;
        const { datums } = useMechanismStore.getState();
        if (!datums.has(entityId)) return; // Only accept datum picks

        const creationState = useLoadCreationStore.getState();

        if (creationState.step === 'pick-datum') {
          creationState.setDatum(entityId);
          return;
        }

        if (creationState.step === 'pick-second-datum') {
          creationState.setSecondDatum(entityId);
          return;
        }

        return;
      }

      // Default: select mode
      if (entityId == null) {
        useSelectionStore.getState().clearSelection();
        return;
      }

      // Check selection filter
      const filter = useSelectionStore.getState().selectionFilter;
      if (filter) {
        const { bodies, geometries, datums, joints, loads } = useMechanismStore.getState();
        const entityType = bodies.has(entityId)
          ? 'body'
          : geometries.has(entityId)
            ? 'geometry'
            : datums.has(entityId)
              ? 'datum'
              : joints.has(entityId)
                ? 'joint'
                : loads.has(entityId)
                  ? 'load'
                  : null;
        if (entityType && !filter.has(entityType as 'body' | 'datum' | 'joint' | 'geometry' | 'load')) return;
      }

      if (modifiers.ctrl) {
        useSelectionStore.getState().toggleSelect(entityId);
      } else if (modifiers.shift) {
        const { bodies, geometries, datums, joints, loads } = useMechanismStore.getState();
        const orderedIds = [...bodies.keys(), ...geometries.keys(), ...datums.keys(), ...joints.keys(), ...loads.keys()];
        useSelectionStore.getState().selectRange(entityId, orderedIds);
      } else {
        useSelectionStore.getState().select(entityId);
      }
    },
    [],
  );

  const handleHover = useCallback((entityId: string | null) => {
    if (useToolModeStore.getState().activeMode === 'create-datum') {
      useSelectionStore.getState().setHovered(null);
      return;
    }
    useSelectionStore.getState().setHovered(entityId);
  }, []);

  return { handleSceneReady, handlePick, handleHover, sceneGraphRef };
}
