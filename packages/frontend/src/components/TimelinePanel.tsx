import { SimulationAction } from '@motionlab/protocol';
import { BottomDock, EmptyState, TimelineScrubber, TimelineTransport } from '@motionlab/ui';
import { Activity, BarChart3 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { sendSimulationControl } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';

const STEP_SIZE = 1 / 60;
const DEFAULT_DURATION = 10;

export function TimelinePanel() {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);

  const [activeTab, setActiveTab] = useState('timeline');
  const [expanded, setExpanded] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState(1);

  const isPlaying = simState === 'running';
  const duration = DEFAULT_DURATION;

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

  const handleSeek = useCallback((_time: number) => {
    // Seek not yet supported by engine — no-op placeholder
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
            isLooping={isLooping}
            speed={speed}
            currentTime={simTime}
            duration={duration}
            onPlayPause={isActive ? handlePlayPause : undefined}
            onStepForward={isActive ? handleStepForward : undefined}
            onStepBack={isActive ? () => handleSeek(Math.max(0, simTime - STEP_SIZE)) : undefined}
            onSkipForward={isActive ? () => handleSeek(duration) : undefined}
            onSkipBack={isActive ? handleSkipBack : undefined}
            onLoopToggle={() => setIsLooping((l) => !l)}
            onSpeedChange={setSpeed}
          />
          <div className="px-2 pb-2">
            <TimelineScrubber
              currentTime={simTime}
              duration={duration}
              onSeek={handleSeek}
              tickInterval={1}
            />
          </div>
        </div>
      )}
      {activeTab === 'charts' && (
        <EmptyState
          icon={<BarChart3 className="size-10" />}
          message="No charts configured"
          hint="Add a sensor output to see charts"
          className="h-full"
        />
      )}
      {activeTab === 'diagnostics' && (
        <EmptyState
          icon={<Activity className="size-10" />}
          message="No diagnostics available"
          hint="Run a simulation to see diagnostics"
          className="h-full"
        />
      )}
    </BottomDock>
  );
}
