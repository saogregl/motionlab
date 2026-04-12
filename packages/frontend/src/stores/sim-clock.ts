// Module-level simulation clock cache — updated imperatively from simulationFrame
// handler. Not a Zustand store to avoid React re-renders on every frame.
// Follows the same pattern as body-poses.ts.

import { useSimulationStore } from './simulation.js';

let simTime = 0;
let stepCount = 0;
let maxSimTime = 0;

// --- Imperative reads (zero-cost, no React) ---

export function getSimTime(): number {
  return simTime;
}

export function getStepCount(): number {
  return stepCount;
}

export function getMaxSimTime(): number {
  return maxSimTime;
}

// --- Hot-path write (called from WebSocket handler) ---

export function setSimClock(time: number, steps: number): void {
  simTime = time;
  stepCount = steps;
  if (time > maxSimTime) maxSimTime = time;
}

export function resetSimClock(): void {
  simTime = 0;
  stepCount = 0;
  maxSimTime = 0;
}

// --- Throttled React broadcast (~10 Hz) ---

const BROADCAST_INTERVAL_MS = 100; // 10 Hz
let broadcastScheduled = false;
let lastBroadcastTime = 0;

function flushBroadcast(): void {
  broadcastScheduled = false;
  lastBroadcastTime = performance.now();
  useSimulationStore.getState().updateSimTime(simTime, stepCount);
}

/**
 * Schedule a throttled write of the current sim-clock values into the Zustand
 * simulation store so React subscribers see updates at ~10 Hz instead of every
 * simulation frame (~60 Hz).
 */
export function scheduleReactBroadcast(): void {
  if (broadcastScheduled) return;
  const elapsed = performance.now() - lastBroadcastTime;
  if (elapsed >= BROADCAST_INTERVAL_MS) {
    // Enough time has passed — flush on next rAF (keeps it off the WebSocket
    // handler's synchronous stack).
    broadcastScheduled = true;
    requestAnimationFrame(flushBroadcast);
  } else {
    // Too soon — schedule for the remaining interval.
    broadcastScheduled = true;
    setTimeout(() => {
      broadcastScheduled = false;
      requestAnimationFrame(flushBroadcast);
    }, BROADCAST_INTERVAL_MS - elapsed);
  }
}
