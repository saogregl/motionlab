import type { SceneGraphManager } from '@motionlab/viewport';
import { useCallback, useEffect, useRef } from 'react';

import type { BodyPose, BodyState, MeshData } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';

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

    // Initial sync: add any bodies already in the store
    const bodies = useMechanismStore.getState().bodies;
    for (const body of bodies.values()) {
      sceneGraph.addBody(body.id, body.name, convertMeshData(body.meshData), convertPose(body.pose));
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

    const trackedIds = new Set<string>(useMechanismStore.getState().bodies.keys());

    const unsubMechanism = useMechanismStore.subscribe((state) => {
      const currentIds = new Set<string>(state.bodies.keys());

      // Add new bodies
      for (const id of currentIds) {
        if (!trackedIds.has(id)) {
          const body = state.bodies.get(id)!;
          sg.addBody(body.id, body.name, convertMeshData(body.meshData), convertPose(body.pose));
        }
      }

      // Remove missing bodies
      for (const id of trackedIds) {
        if (!currentIds.has(id)) {
          sg.removeBody(id);
        }
      }

      // Fit if we went from 0 to N
      const hadBodies = trackedIds.size > 0;
      trackedIds.clear();
      for (const id of currentIds) trackedIds.add(id);

      if (!hadBodies && trackedIds.size > 0) {
        sg.fitAll();
      }
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
    };
  }, [sceneGraphRef.current]);

  const handlePick = useCallback(
    (entityId: string | null, modifiers: { ctrl: boolean; shift: boolean }) => {
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
    useSelectionStore.getState().setHovered(entityId);
  }, []);

  return { handleSceneReady, handlePick, handleHover, sceneGraphRef };
}
