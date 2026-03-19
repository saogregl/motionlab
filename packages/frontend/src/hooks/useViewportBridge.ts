import type { SceneGraphManager, SpatialPickData } from '@motionlab/viewport';
import { useCallback, useEffect, useRef } from 'react';

import { registerSceneGraph, sendCreateDatumFromFace } from '../engine/connection.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import type { BodyPose, MeshData } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { resolveDatumFacePick } from '../utils/datum-face-pick.js';
import { nextDatumName } from '../utils/datum-naming.js';

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

function convertMeshData(meshData: MeshData) {
  return {
    vertices: meshData.vertices,
    indices: meshData.indices,
    normals: meshData.normals,
  };
}

export function useViewportBridge() {
  const sceneGraphRef = useRef<SceneGraphManager | null>(null);

  const handleSceneReady = useCallback((sceneGraph: SceneGraphManager) => {
    sceneGraphRef.current = sceneGraph;
    registerSceneGraph(sceneGraph);

    // Initial sync: add any bodies already in the store
    const { bodies, datums, joints } = useMechanismStore.getState();
    for (const body of bodies.values()) {
      sceneGraph.addBody(
        body.id,
        body.name,
        convertMeshData(body.meshData),
        convertPose(body.pose),
        body.partIndex,
      );
    }

    // Initial sync: add any datums already in the store
    for (const datum of datums.values()) {
      sceneGraph.addDatum(datum.id, datum.parentBodyId, convertPose(datum.localPose));
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
    sceneGraph.applySelection(selectedIds);
    sceneGraph.applyHover(hoveredId);
  }, []);

  // Store subscriptions — set up after scene is ready, tear down on unmount
  useEffect(() => {
    const sg = sceneGraphRef.current;
    if (!sg) return;

    const trackedBodyIds = new Set<string>(useMechanismStore.getState().bodies.keys());
    const trackedDatumIds = new Set<string>(useMechanismStore.getState().datums.keys());
    const trackedJointIds = new Set<string>(useMechanismStore.getState().joints.keys());

    const unsubMechanism = useMechanismStore.subscribe((state) => {
      // --- Body diff ---
      const currentBodyIds = new Set<string>(state.bodies.keys());

      for (const id of currentBodyIds) {
        if (!trackedBodyIds.has(id)) {
          const body = state.bodies.get(id);
          if (!body) continue;
          sg.addBody(
            body.id,
            body.name,
            convertMeshData(body.meshData),
            convertPose(body.pose),
            body.partIndex,
          );
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
          sg.addDatum(datum.id, datum.parentBodyId, convertPose(datum.localPose));
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
    });

    const unsubSelection = useSelectionStore.subscribe((state) => {
      sg.applySelection(state.selectedIds);
    });

    const unsubHover = useSelectionStore.subscribe((state) => {
      sg.applyHover(state.hoveredId);
    });

    return () => {
      unsubMechanism();
      unsubSelection();
      unsubHover();
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

      if (isSimulating && (mode === 'create-datum' || mode === 'create-joint')) {
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
        if (!entityId) return;
        const { datums } = useMechanismStore.getState();
        // Only accept picks on datums
        if (!datums.has(entityId)) return;

        const creationState = useJointCreationStore.getState();

        if (creationState.step === 'pick-parent') {
          creationState.setParentDatum(entityId);
          return;
        }

        if (creationState.step === 'pick-child') {
          // Validate different body
          const parentDatum = creationState.parentDatumId
            ? datums.get(creationState.parentDatumId)
            : undefined;
          const childDatum = datums.get(entityId);
          if (!parentDatum || !childDatum) return;

          if (parentDatum.parentBodyId === childDatum.parentBodyId) {
            console.warn('[joint] Parent and child datums must be on different bodies');
            return;
          }

          creationState.setChildDatum(entityId);
          return;
        }

        return;
      }

      // Default: select mode
      if (entityId == null) {
        useSelectionStore.getState().clearSelection();
      } else if (modifiers.ctrl) {
        useSelectionStore.getState().toggleSelect(entityId);
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
