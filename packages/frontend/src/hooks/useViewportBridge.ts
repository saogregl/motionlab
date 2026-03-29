import type { SceneGraphManager, SpatialPickData } from '@motionlab/viewport';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DETACHED_BODY_PREFIX,
  registerSceneGraph,
  sendAnalyzeFacePair,
  sendCreateDatum,
  sendCreateDatumFromFace,
  sendUpdateBody,
  sendUpdateDatumPose,
} from '../engine/connection.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import type {
  ActuatorState,
  BodyPose,
  BodyState,
  GeometryState,
  LoadState,
} from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useVisibilityStore } from '../stores/visibility.js';
import { analyzeDatumAlignment, computeDatumWorldPose } from '../utils/datum-alignment.js';
import { resolveDatumFacePick } from '../utils/datum-face-pick.js';
import { nextDatumName } from '../utils/datum-naming.js';
import {
  resolveViewportEntityId,
  resolveViewportEntityIds,
} from '../utils/viewport-entity-resolution.js';

/**
 * Compute a body-local datum pose from a world-space hit point and normal.
 * The datum Z-axis is aligned to the world normal; the position is converted
 * to body-local using the body's world matrix inverse.
 */
function localPoseFromSpatial(spatial: SpatialPickData): {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
} {
  const wp = spatial.worldPoint;
  const wn = spatial.worldNormal;

  // Invert body world matrix to get local position
  // bodyWorldMatrix is a column-major Float32Array (4x4)
  const m = spatial.bodyWorldMatrix;
  // Simple inversion for rigid transforms: transpose rotation, negate translated position
  // m = [r00 r10 r20 0 | r01 r11 r21 0 | r02 r12 r22 0 | tx ty tz 1] (column-major)
  const r00 = m[0],
    r01 = m[4],
    r02 = m[8];
  const r10 = m[1],
    r11 = m[5],
    r12 = m[9];
  const r20 = m[2],
    r21 = m[6],
    r22 = m[10];
  const tx = m[12],
    ty = m[13],
    tz = m[14];

  // Local position = R^T * (worldPoint - translation)
  const dx = wp.x - tx,
    dy = wp.y - ty,
    dz = wp.z - tz;
  const localPos = {
    x: r00 * dx + r10 * dy + r20 * dz,
    y: r01 * dx + r11 * dy + r21 * dz,
    z: r02 * dx + r12 * dy + r22 * dz,
  };

  // Compute quaternion that rotates [0,0,1] to the world normal direction,
  // then transform to body-local frame
  const nx = wn.x,
    ny = wn.y,
    nz = wn.z;
  // Transform normal to body-local
  const localNx = r00 * nx + r10 * ny + r20 * nz;
  const localNy = r01 * nx + r11 * ny + r21 * nz;
  const localNz = r02 * nx + r12 * ny + r22 * nz;

  // Shortest arc quaternion from [0,0,1] to localNormal
  const dot = localNz; // dot([0,0,1], localNormal)
  if (dot > 0.9999) {
    return { position: localPos, orientation: { x: 0, y: 0, z: 0, w: 1 } };
  }
  if (dot < -0.9999) {
    return { position: localPos, orientation: { x: 1, y: 0, z: 0, w: 0 } };
  }
  // cross([0,0,1], localNormal) = [-localNy, localNx, 0]
  const cx = -localNy,
    cy = localNx,
    cz = 0;
  const w = 1 + dot;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz + w * w);
  return {
    position: localPos,
    orientation: { x: cx / len, y: cy / len, z: cz / len, w: w / len },
  };
}

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

export function bodyPoseSignature(body: Pick<BodyState, 'pose'>): string {
  return poseSignature(body.pose);
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
  // Incremented by handleSceneReady once the R3F scene is ready. The
  // subscription effect depends on this so it re-runs after the scene graph
  // reference is set (R3F fires its effects after the DOM commit phase).
  const [sgTrigger, setSgTrigger] = useState(0);

  const handleSceneReady = useCallback((sceneGraph: SceneGraphManager) => {
    sceneGraphRef.current = sceneGraph;
    registerSceneGraph(sceneGraph);

    // Initial sync: add any bodies already in the store
    const { bodies, geometries, datums, joints } = useMechanismStore.getState();
    const geometriesByBody = groupGeometriesByBody(geometries);
    for (const body of bodies.values()) {
      const bodyGeoms = geometriesByBody.get(body.id) ?? [];
      if (bodyGeoms.length === 0) continue;
      sceneGraph.upsertBody(body.id, body.name, convertPose(body.pose));
      for (const geometry of bodyGeoms) {
        sceneGraph.addBodyGeometry(
          body.id,
          geometry.id,
          geometry.name,
          geometry.meshData,
          convertPose(geometry.localPose),
          geometry.partIndex,
        );
      }
    }
    // Initial sync: add detached geometries as synthetic body nodes
    for (const geometry of geometries.values()) {
      if (!geometry.parentBodyId) {
        const syntheticId = `${DETACHED_BODY_PREFIX}${geometry.id}`;
        const pose = geometry.localPose;
        sceneGraph.upsertBody(syntheticId, geometry.name, convertPose(pose));
        sceneGraph.addBodyGeometry(
          syntheticId,
          geometry.id,
          geometry.name,
          geometry.meshData,
          { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
          geometry.partIndex,
        );
      }
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
      if (event.entityKind === 'datum') {
        sendUpdateDatumPose(event.entityId, {
          position: { x: event.position[0], y: event.position[1], z: event.position[2] },
          orientation: {
            x: event.rotation[0],
            y: event.rotation[1],
            z: event.rotation[2],
            w: event.rotation[3],
          },
        });
      } else if (event.entityKind === 'body') {
        sendUpdateBody(event.entityId, {
          pose: {
            position: { x: event.position[0], y: event.position[1], z: event.position[2] },
            orientation: {
              x: event.rotation[0],
              y: event.rotation[1],
              z: event.rotation[2],
              w: event.rotation[3],
            },
          },
        });
      }
      sceneGraph.refreshJointPositions();
    });

    // Sync display state changes from scene graph to tool-mode store
    sceneGraph.onGridVisibilityChanged = () => {
      useToolModeStore.getState().setGridVisible(sceneGraph.gridVisible);
    };
    sceneGraph.onDatumsVisibilityChanged = () => {
      useToolModeStore.getState().setDatumsVisible(sceneGraph.datumsVisible);
    };
    sceneGraph.onJointAnchorsVisibilityChanged = () => {
      useToolModeStore.getState().setJointsVisible(sceneGraph.jointAnchorsVisible);
    };

    // Signal the subscription effect to wire up now that the scene graph is ready.
    setSgTrigger((t) => t + 1);
  }, []);

  // Store subscriptions — set up after scene is ready, tear down on unmount
  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const trackedBodyIds = new Set<string>(useMechanismStore.getState().bodies.keys());
    const trackedBodyPoseSignatures = new Map<string, string>();
    for (const [id, body] of useMechanismStore.getState().bodies) {
      trackedBodyPoseSignatures.set(id, bodyPoseSignature(body));
    }
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

      const detachedGeomsToAdd = new Set<string>();
      const detachedGeomsToRemove = new Set<string>();

      for (const [id, geometry] of state.geometries) {
        const previous = trackedGeometries.get(id);
        if (!previous) {
          if (geometry.parentBodyId) {
            bodiesNeedingRebuild.add(geometry.parentBodyId);
          } else {
            detachedGeomsToAdd.add(id);
          }
          continue;
        }
        if (previous !== geometry) {
          if (previous.parentBodyId) bodiesNeedingRebuild.add(previous.parentBodyId);
          if (geometry.parentBodyId) bodiesNeedingRebuild.add(geometry.parentBodyId);
          // Handle parent change: detached → parented or parented → detached
          if (!previous.parentBodyId && geometry.parentBodyId) {
            detachedGeomsToRemove.add(id);
          } else if (previous.parentBodyId && !geometry.parentBodyId) {
            detachedGeomsToAdd.add(id);
          } else if (!geometry.parentBodyId) {
            // Still detached but changed — rebuild
            detachedGeomsToRemove.add(id);
            detachedGeomsToAdd.add(id);
          }
        }
      }

      for (const [id, geometry] of trackedGeometries) {
        if (!state.geometries.has(id)) {
          if (geometry.parentBodyId) {
            bodiesNeedingRebuild.add(geometry.parentBodyId);
          } else {
            detachedGeomsToRemove.add(id);
          }
        }
      }

      trackedGeometries.clear();
      for (const [id, geometry] of state.geometries) {
        trackedGeometries.set(id, geometry);
      }

      // --- Body diff ---
      const currentBodyIds = new Set<string>(state.bodies.keys());

      for (const [id, body] of state.bodies) {
        const nextBodyPoseSignature = bodyPoseSignature(body);
        if (!trackedBodyIds.has(id)) {
          // New body — add with attached geometry meshes
          const bodyGeoms = geometriesByBody.get(body.id) ?? [];
          if (bodyGeoms.length > 0) {
            sg.upsertBody(body.id, body.name, convertPose(body.pose));
            for (const geometry of bodyGeoms) {
              sg.addBodyGeometry(
                body.id,
                geometry.id,
                geometry.name,
                geometry.meshData,
                convertPose(geometry.localPose),
                geometry.partIndex,
              );
            }
          }
        } else if (bodiesNeedingRebuild.has(id)) {
          // Body exists but geometries changed — rebuild child geometry meshes
          sg.removeBody(id);
          const bodyGeoms = geometriesByBody.get(body.id) ?? [];
          if (bodyGeoms.length > 0) {
            sg.upsertBody(body.id, body.name, convertPose(body.pose));
            for (const geometry of bodyGeoms) {
              sg.addBodyGeometry(
                body.id,
                geometry.id,
                geometry.name,
                geometry.meshData,
                convertPose(geometry.localPose),
                geometry.partIndex,
              );
            }
          }
        } else {
          const prevBodyPoseSignature = trackedBodyPoseSignatures.get(id);
          if (prevBodyPoseSignature !== nextBodyPoseSignature) {
            sg.updateBodyTransform(id, convertPose(body.pose));
          }
        }

        trackedBodyPoseSignatures.set(id, nextBodyPoseSignature);
      }

      for (const id of trackedBodyIds) {
        if (!currentBodyIds.has(id)) {
          sg.removeBody(id);
          trackedBodyPoseSignatures.delete(id);
        }
      }

      // --- Detached geometry diff ---
      for (const geomId of detachedGeomsToRemove) {
        sg.removeBody(`${DETACHED_BODY_PREFIX}${geomId}`);
      }
      for (const geomId of detachedGeomsToAdd) {
        const geometry = state.geometries.get(geomId);
        if (!geometry) continue;
        const syntheticId = `${DETACHED_BODY_PREFIX}${geomId}`;
        const pose = geometry.localPose;
        sg.upsertBody(syntheticId, geometry.name, convertPose(pose));
        sg.addBodyGeometry(
          syntheticId,
          geometry.id,
          geometry.name,
          geometry.meshData,
          { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
          geometry.partIndex,
        );
      }

      const hadBodies = trackedBodyIds.size > 0;
      trackedBodyIds.clear();
      trackedBodyPoseSignatures.clear();
      for (const [id, body] of state.bodies) {
        trackedBodyIds.add(id);
        trackedBodyPoseSignatures.set(id, bodyPoseSignature(body));
      }

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
        if (joint)
          trackedJointSignatures.set(
            id,
            `${joint.type}:${joint.parentDatumId}:${joint.childDatumId}`,
          );
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

      // Attach gizmo when a single datum or body is selected
      const { gizmoMode } = useToolModeStore.getState();
      if (state.selectedIds.size === 1 && gizmoMode !== 'off') {
        const id = state.selectedIds.values().next().value as string;
        const { datums, bodies } = useMechanismStore.getState();
        if (datums.has(id) || bodies.has(id)) {
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
        const { datums, bodies } = useMechanismStore.getState();
        if (datums.has(id) || bodies.has(id)) {
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
      // Do NOT call registerSceneGraph(null) here: this cleanup also runs when
      // the effect re-fires on canvas remount, which would null-out the newly
      // registered scene graph before the next run can restore it. The scene
      // graph reference is cleared on true unmount via the effect below.
    };
  }, [sgTrigger]);

  // Clear the scene graph reference only when the bridge truly unmounts.
  useEffect(() => {
    return () => {
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

      if (
        isSimulating &&
        (mode === 'create-datum' || mode === 'create-joint' || mode === 'create-load')
      ) {
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
        sendCreateDatumFromFace(resolution.geometryId, resolution.faceIndex, name);
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
              useAuthoringStatusStore
                .getState()
                .setMessage(
                  'Both surfaces are on the same body — pick a surface on a different body',
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
                useAuthoringStatusStore
                  .getState()
                  .setMessage(
                    'Both surfaces are on the same body — pick a surface on a different body',
                  );
                return;
              }
            }
            creationState.setCreatingDatum(true);
            const name = nextDatumName(datums);
            if (
              creationState.step === 'pick-child' &&
              creationState.parentGeometryId !== null &&
              creationState.parentFaceIndex !== null &&
              creationState.parentDatumId
            ) {
              // Pairwise path: engine does analysis + creates child datum
              useAuthoringStatusStore.getState().setMessage('Analyzing joint alignment...');
              sendAnalyzeFacePair(
                creationState.parentDatumId,
                creationState.parentGeometryId,
                creationState.parentFaceIndex,
                resolution.geometryId,
                resolution.faceIndex,
                name,
              );
            } else {
              // Standard path: create datum from face (parent pick, or fallback when no provenance)
              useAuthoringStatusStore.getState().setMessage('Setting joint anchor...');
              sendCreateDatumFromFace(resolution.geometryId, resolution.faceIndex, name);
            }
          } else if (resolution.kind === 'error' && spatial?.bodyId && spatial.worldPoint) {
            // Primitive fallback: no B-Rep face data, but we have a hit point.
            // Create a datum at the hit location using the surface normal as Z-axis.
            const bodyId = spatial.bodyId;

            if (creationState.step === 'pick-child') {
              const parentDatum = creationState.parentDatumId
                ? datums.get(creationState.parentDatumId)
                : undefined;
              if (parentDatum && parentDatum.parentBodyId === bodyId) {
                useAuthoringStatusStore
                  .getState()
                  .setMessage(
                    'Both surfaces are on the same body — pick a surface on a different body',
                  );
                return;
              }
            }

            creationState.setCreatingDatum(true);
            useAuthoringStatusStore.getState().setMessage('Setting joint anchor...');
            const name = nextDatumName(datums);
            const localPose = localPoseFromSpatial(spatial);
            sendCreateDatum(bodyId, name, localPose);
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
              useAuthoringStatusStore
                .getState()
                .setMessage('Choose a different datum for the spring-damper target');
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
        sendCreateDatumFromFace(resolution.geometryId, resolution.faceIndex, name);
        return;
      }

      // Default: select mode
      if (entityId == null) {
        useSelectionStore.getState().clearSelection();
        return;
      }

      // Resolve synthetic detached body IDs to actual geometry IDs
      let resolvedEntityId = entityId;
      if (entityId.startsWith(DETACHED_BODY_PREFIX)) {
        resolvedEntityId = entityId.slice(DETACHED_BODY_PREFIX.length);
      }

      // Check selection filter
      const filter = useSelectionStore.getState().selectionFilter;
      if (filter) {
        const { bodies, geometries, datums, joints, loads, actuators } =
          useMechanismStore.getState();
        const entityType = bodies.has(resolvedEntityId)
          ? 'body'
          : geometries.has(resolvedEntityId)
            ? 'geometry'
            : datums.has(resolvedEntityId)
              ? 'datum'
              : joints.has(resolvedEntityId)
                ? 'joint'
                : loads.has(resolvedEntityId)
                  ? 'load'
                  : actuators.has(resolvedEntityId)
                    ? 'actuator'
                    : null;
        if (entityType && !(filter as Set<string>).has(entityType)) return;
      }

      if (modifiers.ctrl) {
        useSelectionStore.getState().toggleSelect(resolvedEntityId);
      } else if (modifiers.shift) {
        const { bodies, geometries, datums, joints, loads, actuators } =
          useMechanismStore.getState();
        const orderedIds = [
          ...bodies.keys(),
          ...geometries.keys(),
          ...datums.keys(),
          ...joints.keys(),
          ...loads.keys(),
          ...actuators.keys(),
        ];
        useSelectionStore.getState().selectRange(resolvedEntityId, orderedIds);
      } else {
        useSelectionStore.getState().select(resolvedEntityId);
      }
    },
    [],
  );

  const handleHover = useCallback((entityId: string | null) => {
    const mode = useToolModeStore.getState().activeMode;
    if (mode === 'create-datum' || mode === 'create-joint') {
      useSelectionStore.getState().setHovered(null);
      return;
    }
    // Resolve synthetic detached body IDs to actual geometry IDs
    const resolved = entityId?.startsWith(DETACHED_BODY_PREFIX)
      ? entityId.slice(DETACHED_BODY_PREFIX.length)
      : entityId;
    useSelectionStore.getState().setHovered(resolved);
  }, []);

  return { handleSceneReady, handlePick, handleHover, sceneGraphRef };
}
