import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, useCallback } from 'react';

import { TimelineTransport } from './timeline-transport';
import { TimelineScrubber } from './timeline-scrubber';

const meta = {
  title: 'Primitives/TimelinePanel',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function TimelinePanelDemo({ initialTime = 0.342, initialDuration = 2.0 }) {
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = initialDuration;
  const stepSize = 1 / 60; // ~one frame at 60fps

  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);

  const handleStepForward = useCallback(() => {
    setCurrentTime((t) => Math.min(duration, t + stepSize));
  }, [duration, stepSize]);

  const handleStepBack = useCallback(() => {
    setCurrentTime((t) => Math.max(0, t - stepSize));
  }, [stepSize]);

  const handleSkipForward = useCallback(() => {
    setCurrentTime(duration);
  }, [duration]);

  const handleSkipBack = useCallback(() => {
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  return (
    <div className="w-[700px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--layer-base)]">
      <TimelineTransport
        isPlaying={isPlaying}
        isLooping={isLooping}
        speed={speed}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handlePlayPause}
        onStepForward={handleStepForward}
        onStepBack={handleStepBack}
        onSkipForward={handleSkipForward}
        onSkipBack={handleSkipBack}
        onLoopToggle={() => setIsLooping((l) => !l)}
        onSpeedChange={setSpeed}
        className="border-b border-[var(--border-subtle)]"
      />
      <div className="px-2 py-2">
        <TimelineScrubber
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          tickInterval={0.2}
        />
      </div>
    </div>
  );
}

export const Default: Story = {
  render: () => <TimelinePanelDemo />,
};

export const MidPlayback: Story = {
  render: () => <TimelinePanelDemo initialTime={0.875} />,
};
