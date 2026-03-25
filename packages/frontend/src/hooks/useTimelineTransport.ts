import { SimulationAction } from '@motionlab/protocol';
import { useCallback, useMemo } from 'react';

import { sendScrub, sendSimulationControl, setPlaybackSpeed } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';

const STEP_SIZE = 1 / 60;

export function useTimelineTransport() {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const maxSimTime = useSimulationStore((s) => s.maxSimTime);
  const loopEnabled = useSimulationStore((s) => s.loopEnabled);

  const isPlaying = simState === 'running';
  const duration = Math.max(maxSimTime, STEP_SIZE);
  const isActive = simState !== 'idle' && simState !== 'compiling';

  const throttledSeek = useMemo(() => {
    let lastCall = 0;
    return (time: number) => {
      const now = Date.now();
      if (now - lastCall < 33) return;
      lastCall = now;
      const { state } = useSimulationStore.getState();
      if (state === 'running') sendSimulationControl(SimulationAction.PAUSE);
      sendScrub(time);
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    if (simState === 'running') {
      sendSimulationControl(SimulationAction.PAUSE);
    } else if (simState === 'paused') {
      sendSimulationControl(SimulationAction.PLAY);
    }
  }, [simState]);

  const handleStepForward = useCallback(() => {
    if (simState === 'paused') {
      sendSimulationControl(SimulationAction.STEP);
    }
  }, [simState]);

  const handleSkipBack = useCallback(() => {
    sendSimulationControl(SimulationAction.RESET);
  }, []);

  const handleSeek = useCallback((time: number) => {
    sendScrub(time);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleLoopToggle = useCallback(() => {
    useSimulationStore.getState().setLoopEnabled(!useSimulationStore.getState().loopEnabled);
  }, []);

  return {
    simState,
    simTime,
    duration,
    isPlaying,
    isActive,
    loopEnabled,
    stepSize: STEP_SIZE,
    throttledSeek,
    handlePlayPause,
    handleStepForward,
    handleSkipBack,
    handleSeek,
    handleSpeedChange,
    handleLoopToggle,
  };
}
