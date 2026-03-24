import { SimulationAction } from '@motionlab/protocol';
import { BottomDock, EmptyState, TimelineScrubber, TimelineTransport } from '@motionlab/ui';
import { BarChart3 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { sendScrub, sendSimulationControl, setPlaybackSpeed } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { ChannelBrowser } from './ChannelBrowser.js';
import { ChartPanel } from './ChartPanel.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';

const STEP_SIZE = 1 / 60;

export function TimelinePanel() {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const maxSimTime = useSimulationStore((s) => s.maxSimTime);
  const channelDescriptors = useSimulationStore((s) => s.channelDescriptors);
  const loopEnabled = useSimulationStore((s) => s.loopEnabled);

  const activeTab = useUILayoutStore((s) => s.bottomDockActiveTab);
  const expanded = useUILayoutStore((s) => s.bottomDockExpanded);
  const setActiveTab = useUILayoutStore((s) => s.setBottomDockActiveTab);
  const setExpanded = useUILayoutStore((s) => s.setBottomDockExpanded);

  const isPlaying = simState === 'running';
  const duration = Math.max(maxSimTime, STEP_SIZE);

  // Throttled scrub: ≤30 commands/s, auto-pause on drag
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

  // Unthrottled seek for button-triggered navigation
  const handleSeek = useCallback((time: number) => {
    sendScrub(time);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleLoopToggle = useCallback(() => {
    useSimulationStore.getState().setLoopEnabled(!useSimulationStore.getState().loopEnabled);
  }, []);

  const isActive = simState !== 'idle' && simState !== 'compiling';

  return (
    <BottomDock
      tabs={[
        { id: 'timeline', label: 'Timeline' },
        { id: 'charts', label: 'Charts' },
        { id: 'diagnostics', label: 'Diagnostics' },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      {activeTab === 'timeline' && (
        <div className="flex flex-col">
          <TimelineTransport
            isPlaying={isPlaying}
            isLooping={loopEnabled}
            speed={1}
            currentTime={simTime}
            duration={duration}
            onPlayPause={isActive ? handlePlayPause : undefined}
            onStepForward={isActive ? handleStepForward : undefined}
            onStepBack={isActive ? () => handleSeek(Math.max(0, simTime - STEP_SIZE)) : undefined}
            onSkipForward={isActive ? () => handleSeek(duration) : undefined}
            onSkipBack={isActive ? handleSkipBack : undefined}
            onLoopToggle={handleLoopToggle}
            onSpeedChange={handleSpeedChange}
          />
          <div className="px-2 pb-2">
            <TimelineScrubber
              currentTime={simTime}
              duration={duration}
              onSeek={throttledSeek}
              tickInterval={1}
            />
          </div>
        </div>
      )}
      {activeTab === 'charts' &&
        (channelDescriptors.length > 0 ? (
          <div className="flex h-full">
            <div className="w-56 shrink-0 overflow-hidden border-e border-[var(--border-subtle)]">
              <ChannelBrowser />
            </div>
            <div className="min-w-0 flex-1">
              <ChartPanel />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<BarChart3 className="size-10" />}
            message="No charts configured"
            hint="Compile a mechanism to see output channels"
            className="h-full"
          />
        ))}
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
    </BottomDock>
  );
}
