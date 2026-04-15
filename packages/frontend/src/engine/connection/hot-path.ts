// Hot-path event handlers — called at 60+ Hz during live simulation.
// Kept separate from the table-driven dispatcher so they can be invoked by
// direct function call with no indirection on the per-frame path.
//
// Performance invariants (do NOT change without measuring):
// - reusableBodyTransforms / reusableJointForceUpdates are reused across frames
//   to avoid per-frame allocations. Their inner objects and tuple slots are
//   mutated in place. applyBodyTransforms / applyJointForceUpdates only read
//   them synchronously.
// - setSimClock writes a module-level cache (zero React cost);
//   scheduleReactBroadcast throttles store updates to ~10 Hz.

import { getDebugRecorder } from '../../debug/api.js';
import { setBodyPose } from '../../stores/body-poses.js';
import { scheduleReactBroadcast, setSimClock } from '../../stores/sim-clock.js';
import { addSamplesBatched, type StoreSample } from '../../stores/traces.js';
import { connState } from './state.js';

// biome-ignore lint/suspicious/noExplicitAny: proto event payload — frame fields are read directly
export function handleSimulationFrame(frame: any): void {
  // FPS measurement
  const now = performance.now();
  connState.frameCount++;
  if (now - connState.lastFpsMeasure > 1000) {
    connState.measuredFps = connState.frameCount;
    connState.frameCount = 0;
    connState.lastFpsMeasure = now;
  }

  // Frame skipping for sub-1x playback speeds
  if (connState.playbackSpeed < 1) {
    connState.frameSkipCounter++;
    const skip = Math.round(1 / connState.playbackSpeed); // 0.5→2, 0.25→4
    if (connState.frameSkipCounter % skip !== 0) return;
  }

  if (!connState.sceneGraphManager) {
    console.warn('[sim] no sceneGraphManager, skipping frame');
    if (!connState.reportedMissingSceneGraphForSession) {
      connState.reportedMissingSceneGraphForSession = true;
      getDebugRecorder().recordAnomaly({
        severity: 'warning',
        code: 'simulation-frame-without-scene-graph',
        message: 'Simulation frames arrived before the scene graph manager was attached',
      });
    }
    return;
  }
  if (frame.bodyPoses.length === 0) {
    console.warn('[sim] frame has no body poses');
  }
  const bodyCount = frame.bodyPoses.length;
  while (connState.reusableBodyTransforms.length < bodyCount) {
    connState.reusableBodyTransforms.push({
      id: '',
      pose: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    });
  }
  connState.reusableBodyTransforms.length = bodyCount;
  for (let i = 0; i < bodyCount; i++) {
    const bp = frame.bodyPoses[i];
    const px = bp.position?.x ?? 0;
    const py = bp.position?.y ?? 0;
    const pz = bp.position?.z ?? 0;
    const rx = bp.orientation?.x ?? 0;
    const ry = bp.orientation?.y ?? 0;
    const rz = bp.orientation?.z ?? 0;
    const rw = bp.orientation?.w ?? 1;
    setBodyPose(bp.bodyId, { x: px, y: py, z: pz }, { x: rx, y: ry, z: rz, w: rw });
    const slot = connState.reusableBodyTransforms[i] as {
      id: string;
      pose: {
        position: [number, number, number];
        rotation: [number, number, number, number];
      };
    };
    slot.id = bp.bodyId;
    slot.pose.position[0] = px;
    slot.pose.position[1] = py;
    slot.pose.position[2] = pz;
    slot.pose.rotation[0] = rx;
    slot.pose.rotation[1] = ry;
    slot.pose.rotation[2] = rz;
    slot.pose.rotation[3] = rw;
  }
  connState.sceneGraphManager.applyBodyTransforms(connState.reusableBodyTransforms);

  const jointCount = frame.jointStates.length;
  while (connState.reusableJointForceUpdates.length < jointCount) {
    connState.reusableJointForceUpdates.push({
      jointId: '',
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
    });
  }
  connState.reusableJointForceUpdates.length = jointCount;
  for (let i = 0; i < jointCount; i++) {
    const js = frame.jointStates[i];
    const slot = connState.reusableJointForceUpdates[i] as {
      jointId: string;
      force: { x: number; y: number; z: number };
      torque: { x: number; y: number; z: number };
    };
    slot.jointId = js.jointId;
    slot.force.x = js.reactionForce?.x ?? 0;
    slot.force.y = js.reactionForce?.y ?? 0;
    slot.force.z = js.reactionForce?.z ?? 0;
    slot.torque.x = js.reactionTorque?.x ?? 0;
    slot.torque.y = js.reactionTorque?.y ?? 0;
    slot.torque.z = js.reactionTorque?.z ?? 0;
  }
  connState.sceneGraphManager.applyJointForceUpdates(connState.reusableJointForceUpdates);

  // Update simulation time so the timeline tracks progress. Module-level
  // cache write is zero React cost; the throttled broadcast lands at ~10 Hz.
  setSimClock(frame.simTime, Number(frame.stepCount));
  scheduleReactBroadcast();
}

// biome-ignore lint/suspicious/noExplicitAny: proto event payload — trace samples are read directly
export function handleSimulationTrace(trace: any): void {
  const samples: StoreSample[] = [];
  for (const s of trace.samples) {
    if (s.value.case === 'vector') {
      const v = s.value.value;
      samples.push({
        time: s.time,
        value: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
        vec: { x: v.x, y: v.y, z: v.z },
      });
    } else if (s.value.case === 'scalar') {
      samples.push({ time: s.time, value: s.value.value });
    }
  }
  addSamplesBatched(trace.channelId, samples);
}
