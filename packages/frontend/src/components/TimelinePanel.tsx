import { BottomDock, TimelineScrubber, TimelineTransport } from '@motionlab/ui';

import { useTimelineTransport } from '../hooks/useTimelineTransport.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';

export function TimelinePanel() {
  const {
    simTime,
    duration,
    isPlaying,
    isActive,
    loopEnabled,
    stepSize,
    throttledSeek,
    handlePlayPause,
    handleStepForward,
    handleSkipBack,
    handleSeek,
    handleSpeedChange,
    handleLoopToggle,
  } = useTimelineTransport();

  const activeTab = useUILayoutStore((s) => s.bottomDockActiveTab);
  const expanded = useUILayoutStore((s) => s.bottomDockExpanded);
  const setActiveTab = useUILayoutStore((s) => s.setBottomDockActiveTab);
  const setExpanded = useUILayoutStore((s) => s.setBottomDockExpanded);

  return (
    <BottomDock
      tabs={[
        { id: 'timeline', label: 'Timeline' },
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
            onStepBack={isActive ? () => handleSeek(Math.max(0, simTime - stepSize)) : undefined}
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
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
    </BottomDock>
  );
}
