// Module-level body pose cache — updated imperatively from simulationFrame handler.
// Not a Zustand store to avoid React re-renders on every frame.

export interface BodyPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

const bodyPoses = new Map<string, BodyPose>();

export function setBodyPose(
  bodyId: string,
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number; w: number },
): void {
  bodyPoses.set(bodyId, { position, rotation });
}

export function getBodyPose(bodyId: string): BodyPose | undefined {
  return bodyPoses.get(bodyId);
}

export function getBodyPoseCount(): number {
  return bodyPoses.size;
}

export function clearBodyPoses(): void {
  bodyPoses.clear();
}
