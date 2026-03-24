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
import type { ActuatorState, BodyPose, GeometryState, LoadState } from '../stores/mechanism.js';
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

function poseSignature(pose: BodyPose): string {
  return [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.rotation.x,
    pose.rotation.y,
    pose.rotation.z,
    pose.rotation.w,
  ].join('|');
}

function loadSignature(load: LoadState): string {
  return [
    load.type,
    load.datumId ?? '',
    load.parentDatumId ?? '',
    load.childDatumId ?? '',
    load.vector?.x ?? '',
    load.vector?.y ?? '',
    load.vector?.z ?? '',
    load.referenceFrame ?? '',
    load.restLength ?? '',
    load.stiffness ?? '',
    load.damping ?? '',
  ].join('|');
}

function actuatorSignature(actuator: ActuatorState): string {
  return [
    actuator.type,
    actuator.jointId,
    actuator.controlMode,
    actuator.commandValue,
    actuator.effortLimit ?? '',
  ].join('|');
}

function groupGeometriesByBody(
  geometries: Map<string, GeometryState>,
): Map<string, GeometryState[]> {
  const grouped = new Map<string, GeometryState[]>();
  for (const geometry of geometries.values()) {
    if (!geometry.parentBodyId) continue;
    const bucket = grouped.get(geometry.parentBodyId);
    if (bucket) {
      bucket.push(geometry);
    } else {
      grouped.set(geometry.parentBodyId, [geometry]);
    }
  }
  return grouped;
}

export function useViewportBridge() {
  const sceneGraphRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sceneGraph: SceneGraphManager) => {
    sceneGraphRef.current = sceneGraph;
    registerSceneGraph(sceneGraph);

    // Initial sync: add any bodies already in the store
    const { bodies, geometries, datums, joints } = useMechanismStore.getState();
    const geometriesByBody = groupGeometriesByBody(geometries);
    for (const body of bodies.values()) {
      const bodyGeoms = geometriesByBody.get(body.id) ?? [];
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

    // Initial sync: add any loads already in the store (after datums)
    const { loads, actuators } = useMechanismStore.getState();
    for (const load of loads.values()) {
      sceneGraph.addLoadVisual(load.id, load);
    }

    // Initial sync: add any actuators already in the store (after joints)
    for (const actuator of actuators.values()) {
      sceneGraph.addMotorVisual(actuator.id, actuator.jointId, actuator.type);
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
    const trackedGeometries = new Map(useMechanismStore.getState().geometries);
    const trackedDatumIds = new Set<string>(useMechanismStore.getState().datums.keys());
    const trackedDatumSignatures = new Map<string, string>();
    const trackedJointIds = new Set<string>(useMechanismStore.getState().joints.keys());
    const trackedJointSignatures = new Map<string, string>();
    const trackedLoadIds = new Set<string>(useMechanismStore.getState().loads.keys());
    const trackedLoadSignatures = new Map<string, string>();
    const trackedActuatorIds = new Set<string>(useMechanismStore.getState().actuators.keys());
    const trackedActuatorSignatures = new Map<string, string>();

    const unsubMechanism = useMechanismStore.subscribe((state) => {
      const bodiesNeedingRebuild = new Set<string>();
      const geometriesByBody = groupGeometriesByBody(state.geometries);

      for (const [id, geometry] of state.geometries) {
        const previous = trackedGeometries.get(id);
        if (!previous) {
          if (geometry.parentBodyId) bodiesNeedingRebuild.add(geometry.parentBodyId);
          continue;
        }
        if (previous !== geometry) {
          if (previous.parentBodyId) bodiesNeedingRebuild.add(previous.parentBodyId);
          if (geometry.parentBodyId) bodiesNeedingRebuild.add(geometry.parentBodyId);
        }
      }

      for (const [id, geometry] of trackedGeometries) {
        if (!state.geometries.has(id) && geometry.parentBodyId) {
          bodiesNeedingRebuild.add(geometry.parentBodyId);
        }
      }

      trackedGeometries.clear();
      for (const [id, geometry] of state.geometries) {
        trackedGeometries.set(id, geometry);
      }

      // --- Body diff ---
      const currentBodyIds = new Set<string>(state.bodies.keys());

      for (const id of currentBodyIds) {
        if (!trackedBodyIds.has(id)) {
          // New body — add with merged geometry meshes
          const body = state.bodies.get(id);
          if (!body) continue;
          const bodyGeoms = geometriesByBody.get(body.id) ?? [];
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
          const bodyGeoms = geometriesByBody.get(body.id) ?? [];
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
          trackedDatumSignatures.set(id, poseSignature(datum.localPose));
          continue;
        }

        const datum = state.datums.get(id);
        if (!datum) continue;
        const nextSignature = poseSignature(datum.localPose);
        const prevSignature = trackedDatumSignatures.get(id);
        if (prevSignature !== nextSignature) {
          sg.updateDatumPose(id, convertPose(datum.localPose));
          trackedDatumSignatures.set(id, nextSignature);
        }
      }

      for (const id of trackedDatumIds) {
        if (!currentDatumIds.has(id)) {
          sg.removeDatum(id);
          trackedDatumSignatures.delete(id);
        }
      }

      trackedDatumIds.clear();
      for (const id of currentDatumIds) {
        trackedDatumIds.add(id);
        const datum = state.datums.get(id);
        if (datum) trackedDatumSignatures.set(id, poseSignature(datum.localPose));
      }

      // --- Joint diff (runs after datum diff so datum entities exist) ---
      const currentJointIds = new Set<string>(state.joints.keys());

      for (const id of currentJointIds) {
        if (!trackedJointIds.has(id)) {
          const joint = state.joints.get(id);
          if (!joint) continue;
          sg.addJoint(joint.id, joint.parentDatumId, joint.childDatumId, joint.type);
          sg.updateJointLimits(joint.id, joint.lowerLimit, joint.upperLimit);
        }
      }

      for (const id of trackedJointIds) {
        if (!currentJointIds.has(id)) {
          sg.removeJoint(id);
        }
      }

      // Check for joint type/datum updates on existing joints
      for (const id of currentJointIds) {
        if (trackedJointIds.has(id)) {
          const joint = state.joints.get(id);
          if (!joint) continue;
          const sig = `${joint.type}:${joint.parentDatumId}:${joint.childDatumId}`;
          const prevSig = trackedJointSignatures.get(id);
          if (prevSig !== undefined && prevSig !== sig) {
            // Type or datum IDs changed — rebuild the joint visual
            sg.removeJoint(id);
            sg.addJoint(joint.id, joint.parentDatumId, joint.childDatumId, joint.type);
            sg.updateJointLimits(joint.id, joint.lowerLimit, joint.upperLimit);
          } else {
            // Limits may have changed without type/datum change
            sg.updateJointLimits(joint.id, joint.lowerLimit, joint.upperLimit);
          }
        }
      }

      trackedJointIds.clear();
      trackedJointSignatures.clear();
      for (const id of currentJointIds) {
        trackedJointIds.add(id);
        const joint = state.joints.get(id);
        if (joint) trackedJointSignatures.set(id, `${joint.type}:${joint.parentDatumId}:${joint.childDatumId}`);
      }

      // --- Load diff ---
      const currentLoadIds = new Set<string>(state.loads.keys());

      for (const id of currentLoadIds) {
        if (!trackedLoadIds.has(id)) {
          const load = state.loads.get(id);
          if (!load) continue;
          sg.addLoadVisual(load.id, load);
          trackedLoadSignatures.set(id, loadSignature(load));
          continue;
        }

        const load = state.loads.get(id);
        if (!load) continue;
        const nextSignature = loadSignature(load);
        if (trackedLoadSignatures.get(id) !== nextSignature) {
          sg.updateLoadVisual(load.id, load);
          trackedLoadSignatures.set(id, nextSignature);
        }
      }

      for (const id of trackedLoadIds) {
        if (!currentLoadIds.has(id)) {
          sg.removeLoadVisual(id);
          trackedLoadSignatures.delete(id);
        }
      }

      trackedLoadIds.clear();
      trackedLoadSignatures.clear();
      for (const id of currentLoadIds) {
        trackedLoadIds.add(id);
        const load = state.loads.get(id);
        if (load) trackedLoadSignatures.set(id, loadSignature(load));
      }

      // --- Actuator diff ---
      const currentActuatorIds = new Set<string>(state.actuators.keys());

      for (const id of currentActuatorIds) {
        if (!trackedActuatorIds.has(id)) {
          const actuator = state.actuators.get(id);
          if (!actuator) continue;
          sg.addMotorVisual(actuator.id, actuator.jointId, actuator.type);
          trackedActuatorSignatures.set(id, actuatorSignature(actuator));
          continue;
        }

        const actuator = state.actuators.get(id);
        if (!actuator) continue;
        const nextSignature = actuatorSignature(actuator);
        if (trackedActuatorSignatures.get(id) !== nextSignature) {
          sg.updateMotorVisual(actuator.id, actuator.jointId, actuator.type);
          trackedActuatorSignatures.set(id, nextSignature);
        }
      }

      for (const id of trackedActuatorIds) {
        if (!currentActuatorIds.has(id)) {
          sg.removeMotorVisual(id);
          trackedActuatorSignatures.delete(id);
        }
      }

      trackedActuatorIds.clear();
      trackedActuatorSignatures.clear();
      for (const id of currentActuatorIds) {
        trackedActuatorIds.add(id);
        const actuator = state.actuators.get(id);
        if (actuator) trackedActuatorSignatures.set(id, actuatorSignature(actuator));
      }
    });

    let prevSelectedIds = useSelectionStore.getState().selectedIds;
    const unsubSelection = useSelectionStore.subscribe((state) => {
      if (state.selectedIds === prevSelectedIds) return;
      prevSelectedIds = state.selectedIds;
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

    let prevHoveredId = useSelectionStore.getState().hoveredId;
    const unsubHover = useSelectionStore.subscribe((state) => {
      if (state.hoveredId === prevHoveredId) return;
      prevHoveredId = state.hoveredId;
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
        const creationState = useLoadCreationStore.getState();
        if (creationState.creatingDatum) return;
        if (!entityId) return;

        const { bodies, datums } = useMechanismStore.getState();

        if (datums.has(entityId)) {
          if (creationState.step === 'pick-datum') {
            creationState.setDatum(entityId);
            return;
          }

          if (creationState.step === 'pick-second-datum') {
            if (creationState.datumId === entityId) {
              useAuthoringStatusStore.getState().setMessage(
                'Choose a different datum for the spring-damper target',
              );
              return;
            }
            creationState.setSecondDatum(entityId);
            return;
          }

          return;
        }

        const resolution = resolveDatumFacePick(entityId, bodies, spatial);
        if (resolution.kind === 'ignore') return;
        if (resolution.kind === 'error') {
          useAuthoringStatusStore.getState().setMessage(resolution.message);
          return;
        }

        creationState.setCreatingDatum(true);
        useAuthoringStatusStore.getState().setMessage('Creating datum...');
        const name = nextDatumName(datums);
        sendCreateDatumFromFace(resolution.bodyId, resolution.faceIndex, name);
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
        const { bodies, geometries, datums, joints, loads, actuators } = useMechanismStore.getState();
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
                  : actuators.has(entityId)
                    ? 'actuator'
                    : null;
        if (entityType && !(filter as Set<string>).has(entityType)) return;
      }

      if (modifiers.ctrl) {
        useSelectionStore.getState().toggleSelect(entityId);
      } else if (modifiers.shift) {
        const { bodies, geometries, datums, joints, loads, actuators } = useMechanismStore.getState();
        const orderedIds = [...bodies.keys(), ...geometries.keys(), ...datums.keys(), ...joints.keys(), ...loads.keys(), ...actuators.keys()];
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
