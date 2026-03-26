import { BottomPanel, TimelineScrubber, TimelineTransport } from '@motionlab/ui';

import { useTimelineTransport } from '../hooks/useTimelineTransport.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { ChartPanel } from './ChartPanel.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';

export function ResultsBottomDock() {
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

  const activeTab = useUILayoutStore((s) => s.resultsBottomDockActiveTab);
  const expanded = useUILayoutStore((s) => s.resultsBottomDockExpanded);
  const setActiveTab = useUILayoutStore((s) => s.setResultsBottomDockActiveTab);
  const setExpanded = useUILayoutStore((s) => s.setResultsBottomDockExpanded);

  return (
    <BottomPanel
      tabs={[
        { id: 'charts', label: 'Charts' },
        { id: 'diagnostics', label: 'Diagnostics' },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      expanded={expanded}
      onExpandedChange={setExpanded}
      style={{ '--bottom-panel-h': '45vh' } as React.CSSProperties}
    >
      <div className="flex h-full flex-col">
        {/* Timeline transport — always visible */}
        <div className="shrink-0 border-b border-[var(--border-subtle)] ps-2 pe-2 pt-1 pb-1">
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
          <TimelineScrubber
            currentTime={simTime}
            duration={duration}
            onSeek={throttledSeek}
            tickInterval={1}
          />
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1">
          {activeTab === 'charts' && <ChartPanel />}
          {activeTab === 'diagnostics' && <DiagnosticsPanel />}
        </div>
      </div>
    </BottomPanel>
  );
}
