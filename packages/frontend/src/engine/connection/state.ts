// All module-level mutable state for the engine bridge lives here.
// A single mutable object is exported so consumers can read and write fields
// without the ESM live-binding restriction on namespace imports of `let` exports.

import type { MissingAssetInfo } from '@motionlab/protocol';
import type { BodyTransformUpdate, JointForceUpdate, SceneGraphManager } from '@motionlab/viewport';
import type { GeometryState } from '../../stores/mechanism.js';
import { SaveIntentTracker } from '../save-intent.js';

type RelocateAssetCallback = (bodyId: string, success: boolean, errorMessage?: string) => void;
type MissingAssetsCallback = (assets: MissingAssetInfo[]) => void;

export interface ConnectionState {
  // Transport
  ws: WebSocket | null;
  handshakeTimer: ReturnType<typeof setTimeout> | null;
  connectEpoch: number;
  nextSequenceId: bigint;

  // Scene graph
  sceneGraphManager: SceneGraphManager | null;
  reportedMissingSceneGraphForSession: boolean;

  // State machine bridges
  pendingActionAfterCompile: 'play' | 'step' | null;
  pendingPrimitiveSource: GeometryState['primitiveSource'] | null;
  readonly saveIntentTracker: SaveIntentTracker;

  // FPS / playback
  playbackSpeed: number;
  frameSkipCounter: number;
  frameCount: number;
  lastFpsMeasure: number;
  measuredFps: number;

  // Callbacks
  missingAssetsCallback: MissingAssetsCallback | null;
  relocateAssetCallback: RelocateAssetCallback | null;

  // Hot-path reused buffers — mutated in place per frame.
  readonly reusableBodyTransforms: BodyTransformUpdate[];
  readonly reusableJointForceUpdates: JointForceUpdate[];
}

export const connState: ConnectionState = {
  ws: null,
  handshakeTimer: null,
  connectEpoch: 0,
  nextSequenceId: 1n,

  sceneGraphManager: null,
  reportedMissingSceneGraphForSession: false,

  pendingActionAfterCompile: null,
  pendingPrimitiveSource: null,
  saveIntentTracker: new SaveIntentTracker(),

  playbackSpeed: 1,
  frameSkipCounter: 0,
  frameCount: 0,
  lastFpsMeasure: 0,
  measuredFps: 0,

  missingAssetsCallback: null,
  relocateAssetCallback: null,

  reusableBodyTransforms: [],
  reusableJointForceUpdates: [],
};
